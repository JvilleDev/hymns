//! Sesión de transcripción en vivo sobre Parakeet.
//!
//! Parakeet-TDT es un modelo offline (por enunciado), pero es tan rápido que se puede emular
//! el modo LIVE: un VAD por energía delimita cada enunciado; mientras dura, se re-decodifica
//! periódicamente todo el enunciado (resultado provisional) y al detectar una pausa se emite
//! la decodificación definitiva (final).

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
const END_SILENCE_MS: usize = 700;
const MAX_UTTERANCE_S: usize = 20;
const INTERIM_EVERY_MS: usize = 600;
const MIN_SPEECH_MS: usize = 250;
const MIN_SPEECH_RMS: f32 = 0.012;

fn rms(x: &[f32]) -> f32 {
    if x.is_empty() {
        return 0.0;
    }
    (x.iter().map(|s| s * s).sum::<f32>() / x.len() as f32).sqrt()
}

fn ms(samples: usize) -> usize {
    samples * 1000 / SAMPLE_RATE
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

/// Bucle bloqueante de una sesión; se ejecuta en su propio hilo.
pub fn run_session(
    model: Arc<Mutex<ParakeetTDT>>,
    shared: Arc<Shared>,
    rx: Receiver<In>,
    tx: UnboundedSender<Out>,
) {
    let preroll_len = PREROLL_MS * SAMPLE_RATE / 1000;
    let mut preroll: Vec<f32> = Vec::new();
    let mut utt: Vec<f32> = Vec::new();
    let mut in_utt = false;
    let mut speech_samples = 0usize;
    let mut silence_samples = 0usize;
    let mut since_decode = 0usize;
    let mut noise_floor = 0.004f32;

    let finish = |utt: &mut Vec<f32>, speech: usize| {
        if ms(speech) >= MIN_SPEECH_MS {
            if let Some(text) = decode(&model, utt) {
                let _ = tx.send(Out::Result { text, is_final: true });
            }
        }
        utt.clear();
    };

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

        for msg in pending {
            match msg {
                In::Close => break 'outer,
                In::Flush => {
                    if in_utt {
                        finish(&mut utt, speech_samples);
                        in_utt = false;
                        speech_samples = 0;
                        silence_samples = 0;
                        since_decode = 0;
                    }
                }
                In::Audio(chunk) => {
                    let level = rms(&chunk);
                    shared.set_level(level);
                    // El suelo de ruido sigue lentamente a los tramos silenciosos.
                    let threshold = (noise_floor * 3.0).max(MIN_SPEECH_RMS);
                    let is_speech = level > threshold;
                    if !is_speech {
                        noise_floor = noise_floor * 0.95 + level * 0.05;
                    }

                    if !in_utt {
                        if is_speech {
                            in_utt = true;
                            utt.clear();
                            utt.extend_from_slice(&preroll);
                            utt.extend_from_slice(&chunk);
                            speech_samples = chunk.len();
                            silence_samples = 0;
                            since_decode = utt.len();
                        } else {
                            preroll.extend_from_slice(&chunk);
                            if preroll.len() > preroll_len {
                                let cut = preroll.len() - preroll_len;
                                preroll.drain(..cut);
                            }
                        }
                        continue;
                    }

                    utt.extend_from_slice(&chunk);
                    since_decode += chunk.len();
                    if is_speech {
                        speech_samples += chunk.len();
                        silence_samples = 0;
                    } else {
                        silence_samples += chunk.len();
                    }

                    let ended = ms(silence_samples) >= END_SILENCE_MS;
                    let too_long = utt.len() >= MAX_UTTERANCE_S * SAMPLE_RATE;
                    if ended || too_long {
                        finish(&mut utt, speech_samples);
                        in_utt = false;
                        speech_samples = 0;
                        silence_samples = 0;
                        since_decode = 0;
                        preroll.clear();
                    } else if ms(since_decode) >= INTERIM_EVERY_MS && ms(speech_samples) >= MIN_SPEECH_MS {
                        since_decode = 0;
                        if let Some(text) = decode(&model, &utt) {
                            let _ = tx.send(Out::Result { text, is_final: false });
                        }
                    }
                }
            }
        }
    }

    if in_utt {
        finish(&mut utt, speech_samples);
    }
}
