//! Estado compartido entre el servidor, el motor Parakeet y la UI.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use parakeet_rs::ParakeetTDT;

pub const PORT: u16 = 8090;

#[derive(Clone, Debug, PartialEq)]
pub enum Phase {
    /// Los archivos del modelo no están en disco.
    NeedsModel,
    Downloading,
    Loading,
    Ready,
    Error(String),
}

#[derive(Clone)]
pub struct LogLine {
    pub text: String,
    pub is_final: bool,
}

pub struct Shared {
    pub phase: Mutex<Phase>,
    /// El modelo es único y las sesiones turnan su uso (`transcribe_samples` pide &mut).
    pub engine: RwLock<Option<Arc<Mutex<ParakeetTDT>>>>,
    pub dl_done: AtomicU64,
    pub dl_total: AtomicU64,
    pub clients: AtomicUsize,
    /// RMS del último audio recibido (f32 en bits) para el medidor.
    level_bits: AtomicU32,
    /// Últimos resultados (el último puede ser provisional).
    pub transcript: Mutex<VecDeque<LogLine>>,
    pub notes: Mutex<VecDeque<String>>,
    pub repaint: Mutex<Option<eframe::egui::Context>>,
}

impl Shared {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            phase: Mutex::new(Phase::NeedsModel),
            engine: RwLock::new(None),
            dl_done: AtomicU64::new(0),
            dl_total: AtomicU64::new(0),
            clients: AtomicUsize::new(0),
            level_bits: AtomicU32::new(0),
            transcript: Mutex::new(VecDeque::new()),
            notes: Mutex::new(VecDeque::new()),
            repaint: Mutex::new(None),
        })
    }

    pub fn wake(&self) {
        if let Some(c) = self.repaint.lock().unwrap().as_ref() {
            c.request_repaint();
        }
    }

    pub fn set_phase(&self, p: Phase) {
        *self.phase.lock().unwrap() = p;
        self.wake();
    }

    pub fn phase(&self) -> Phase {
        self.phase.lock().unwrap().clone()
    }

    pub fn set_level(&self, v: f32) {
        self.level_bits.store(v.to_bits(), Ordering::Relaxed);
    }

    pub fn level(&self) -> f32 {
        f32::from_bits(self.level_bits.load(Ordering::Relaxed))
    }

    pub fn note(&self, msg: impl Into<String>) {
        let msg = msg.into();
        eprintln!("[hymns-stt] {msg}");
        let mut n = self.notes.lock().unwrap();
        n.push_back(msg);
        while n.len() > 60 {
            n.pop_front();
        }
        drop(n);
        self.wake();
    }

    /// Registra un resultado: reemplaza el provisional anterior o añade uno final.
    pub fn push_result(&self, text: &str, is_final: bool) {
        let mut t = self.transcript.lock().unwrap();
        if t.back().is_some_and(|l| !l.is_final) {
            t.pop_back();
        }
        t.push_back(LogLine { text: text.to_string(), is_final });
        while t.len() > 40 {
            t.pop_front();
        }
        drop(t);
        self.wake();
    }
}

pub fn data_dir() -> std::path::PathBuf {
    directories::ProjectDirs::from("app", "hymns", "HymnsSTT")
        .map(|d| d.data_dir().to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from("."))
}
