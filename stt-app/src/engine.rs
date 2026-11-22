//! Sesión de transcripción en vivo sobre Parakeet.
//!
//! Parakeet-TDT es un modelo offline (por enunciado), pero es tan rápido que se puede emular
//! el modo LIVE: un VAD por energía delimita cada enunciado; mientras dura, se re-decodifica
//! periódicamente todo el enunciado (resultado provisional) y al detectar una pausa se emite
//! la decodificación definitiva (final).

use std::collections::VecDeque;
use std::sync::mpsc::{Receiver, TryRecvError};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use parakeet_rs::{ParakeetTDT, Transcriber};
use tokio::sync::mpsc::UnboundedSender;

use crate::state::Shared;

pub const SAMPLE_RATE: usize = 16_000;

pub enum In {
    Audio(Vec<f32>),
    /// Cierra el enunciado en curso y emite su final.
    Flush,
    Close,
}

#[derive(Debug)]
pub enum Out {
    Result { text: String, is_final: bool },
}

const PREROLL_MS: usize = 400;
/// Pausa del orador que cierra un enunciado (emite el final).
const END_SILENCE_MS: usize = 300;
/// Si un enunciado llega a esto sin pausa, se parte en el punto más silencioso (no a mitad de palabra).
const MAX_UTTERANCE_S: usize = 18;
const SPLIT_SEARCH_S: usize = 6;
const INTERIM_EVERY_MS: usize = 600;
const MIN_SPEECH_MS: usize = 250;
// Umbral mínimo bajo a propósito: el audio de loopback/virtual (BlackHole…) suele llegar con poco nivel.
const MIN_SPEECH_RMS: f32 = 0.004;
/// El suelo de ruido es el mínimo de los últimos segundos (sigue el ruido de fondo aunque haya voz).
const NOISE_WINDOW_MS: usize = 5000;
const NOISE_FLOOR_CAP: f32 = 0.008;
const NOISE_MARGIN: f32 = 2.5;

fn rms(x: &[f32]) -> f32 {
    if x.is_empty() {
        return 0.0;
    }
    (x.iter().map(|s| s * s).sum::<f32>() / x.len() as f32).sqrt()
}

fn ms(samples: usize) -> usize {
    samples * 1000 / SAMPLE_RATE
}

/// Mínimo del nivel RMS en una ventana deslizante de ~5 s.
struct NoiseFloor {
    win: VecDeque<(f32, usize)>,
    total: usize,
}

impl NoiseFloor {
    fn new() -> Self {
        Self { win: VecDeque::new(), total: 0 }
    }
    fn push(&mut self, level: f32, samples: usize) {
        self.win.push_back((level, samples));
        self.total += samples;
        while self.total > NOISE_WINDOW_MS * SAMPLE_RATE / 1000 && self.win.len() > 1 {
            let (_, n) = self.win.pop_front().unwrap();
            self.total -= n;
        }
    }
    fn floor(&self) -> f32 {
        self.win.iter().map(|x| x.0).fold(f32::MAX, f32::min).clamp(0.0005, NOISE_FLOOR_CAP)
    }
}

/// Punto más silencioso (tramos de 20 ms) entre los últimos 6 s y el último segundo del audio.
fn quietest_split(audio: &[f32]) -> usize {
    let frame = SAMPLE_RATE / 50;
    let start = audio.len().saturating_sub(SPLIT_SEARCH_S * SAMPLE_RATE);
    let end = audio.len().saturating_sub(SAMPLE_RATE);
    let mut best = (f32::MAX, audio.len());
    let mut i = start;
    while i + frame <= end {
        let r = rms(&audio[i..i + frame]);
        if r <= best.0 {
            best = (r, i + frame / 2);
        }
        i += frame;
    }
    best.1
}

fn decode(model: &Mutex<ParakeetTDT>, audio: &[f32]) -> Option<String> {
    // El encoder necesita un mínimo de audio; se rellena con silencio.
    let mut data = audio.to_vec();
    if data.len() < SAMPLE_RATE {
        data.resize(SAMPLE_RATE, 0.0);
    }
    let res = model.lock().unwrap().transcribe_samples(data, SAMPLE_RATE as u32, 1, None);
    match res {
        Ok(r) => {
            let t = r.text.trim().to_string();
            // Descarta resultados sin letras (solo puntuación).
            if t.chars().any(|c| c.is_alphanumeric()) { Some(t) } else { None }
        }
        Err(e) => {
            eprintln!("[hymns-stt] error al transcribir: {e}");
            None
        }
    }
}

/// Enunciado en curso.
struct Utt {
    audio: Vec<f32>,
    speech: usize,
    silence: usize,
    since_decode: usize,
    /// Voz recibida desde el último parcial; si es 0, el parcial ya es el texto final.
    speech_since_decode: usize,
    last_interim: Option<String>,
}

impl Utt {
    fn new(preroll: &[f32], chunk: &[f32]) -> Self {
        let mut audio = Vec::with_capacity(preroll.len() + chunk.len());
        audio.extend_from_slice(preroll);
        audio.extend_from_slice(chunk);
        Self {
            since_decode: audio.len(),
            speech: chunk.len(),
            silence: 0,
            speech_since_decode: chunk.len(),
            last_interim: None,
            audio,
        }
    }
}

fn finish(model: &Mutex<ParakeetTDT>, tx: &UnboundedSender<Out>, u: &Utt) {
    if ms(u.speech) < MIN_SPEECH_MS {
        return;
    }
    // Si desde el último parcial solo hubo silencio, ese parcial ya es el final: no se decodifica otra vez.
    let text = if u.speech_since_decode == 0 { u.last_interim.clone() } else { decode(model, &u.audio) };
    if let Some(text) = text {
        let _ = tx.send(Out::Result { text, is_final: true });
    }
}

/// Bucle bloqueante de una sesión; se ejecuta en su propio hilo.
pub fn run_session(
    model: Arc<Mutex<ParakeetTDT>>,
    shared: Arc<Shared>,
    rx: Receiver<In>,
    tx: UnboundedSender<Out>,
) {
    let preroll_len = PREROLL_MS * SAMPLE_RATE / 1000;
    let mut preroll: Vec<f32> = Vec::new();
    let mut cur: Option<Utt> = None;
    let mut noise = NoiseFloor::new();

    'outer: loop {
        // Espera el siguiente mensaje y drena lo acumulado mientras se decodificaba.
        let mut pending: Vec<In> = Vec::new();
        match rx.recv_timeout(Duration::from_secs(30)) {
            Ok(m) => pending.push(m),
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
            Err(_) => break,
        }
        loop {
            match rx.try_recv() {
                Ok(m) => pending.push(m),
                Err(TryRecvError::Empty | TryRecvError::Disconnected) => break,
            }
        }

        // Los parciales se piden como mucho una vez por tanda: así, si el modelo va más lento que el
        // tiempo real, el retraso no se acumula (cada parcial usa todo el audio ya recibido).
        let mut interim_due = false;
        for msg in pending {
            match msg {
                In::Close => break 'outer,
                In::Flush => {
                    if let Some(u) = cur.take() {
                        finish(&model, &tx, &u);
                    }
                    interim_due = false;
                }
                In::Audio(chunk) => {
                    let level = rms(&chunk);
                    shared.set_level(level);
                    noise.push(level, chunk.len());
                    let base = (noise.floor() * NOISE_MARGIN).max(MIN_SPEECH_RMS);
                    // Histéresis: dentro de un enunciado basta un nivel menor para seguir (palabras suaves).
                    let is_speech = level > if cur.is_some() { base * 0.6 } else { base };

                    let Some(u) = cur.as_mut() else {
                        if is_speech {
                            cur = Some(Utt::new(&preroll, &chunk));
                        } else {
                            preroll.extend_from_slice(&chunk);
                            if preroll.len() > preroll_len {
                                let cut = preroll.len() - preroll_len;
                                preroll.drain(..cut);
                            }
                        }
                        continue;
                    };

                    u.audio.extend_from_slice(&chunk);
                    u.since_decode += chunk.len();
                    if is_speech {
                        u.speech += chunk.len();
                        u.speech_since_decode += chunk.len();
                        u.silence = 0;
                    } else {
                        u.silence += chunk.len();
                    }

                    if ms(u.silence) >= END_SILENCE_MS {
                        let u = cur.take().unwrap();
                        finish(&model, &tx, &u);
                        preroll.clear();
                        interim_due = false;
                    } else if u.audio.len() >= MAX_UTTERANCE_S * SAMPLE_RATE {
                        // Sin pausas: se cierra hasta el punto más silencioso y el resto sigue como enunciado nuevo.
                        let mut u = cur.take().unwrap();
                        let at = quietest_split(&u.audio);
                        let rest = u.audio.split_off(at);
                        u.speech_since_decode = usize::MAX / 2; // fuerza decodificar el tramo cerrado
                        finish(&model, &tx, &u);
                        cur = Some(Utt::new(&[], &rest));
                        interim_due = false;
                    } else if ms(u.since_decode) >= INTERIM_EVERY_MS && ms(u.speech) >= MIN_SPEECH_MS {
                        interim_due = true;
                    }
                }
            }
        }

        if interim_due {
            if let Some(u) = cur.as_mut() {
                u.since_decode = 0;
                u.speech_since_decode = 0;
                u.last_interim = decode(&model, &u.audio);
                if let Some(text) = &u.last_interim {
                    let _ = tx.send(Out::Result { text: text.clone(), is_final: false });
                }
            }
        }
    }

    if let Some(u) = cur.take() {
        finish(&model, &tx, &u);
    }
}
