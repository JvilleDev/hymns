//! Modelo NVIDIA Parakeet-TDT-0.6B-v3 (transductor RNN-T con duración de tokens, 25 idiomas
//! incluido español, con puntuación y mayúsculas) en ONNX int8. Descarga y carga.
//!
//! Nota: el Parakeet CTC de NVIDIA es solo inglés; para español el equivalente es este TDT v3.

use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use futures_util::StreamExt;
use parakeet_rs::{ExecutionConfig, ParakeetTDT};

use crate::state::{data_dir, Phase, Shared};

pub const MODEL_LABEL: &str = "NVIDIA Parakeet TDT 0.6B v3 (int8)";
const BASE_URL: &str = "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main";

/// (archivo, tamaño aproximado en bytes para la barra de progreso total)
const FILES: &[(&str, u64)] = &[
    ("vocab.txt", 93_939),
    ("decoder_joint-model.int8.onnx", 18_202_004),
    ("encoder-model.int8.onnx", 652_183_999),
];

pub fn total_mb() -> u64 {
    FILES.iter().map(|f| f.1).sum::<u64>() / 1_000_000
}

pub fn model_dir() -> PathBuf {
    data_dir().join("models").join("parakeet-tdt-0.6b-v3-int8")
}

pub fn is_downloaded() -> bool {
    FILES.iter().all(|(f, _)| model_dir().join(f).is_file())
}

async fn download(shared: &Arc<Shared>) -> anyhow::Result<()> {
    let dir = model_dir();
    std::fs::create_dir_all(&dir)?;
    shared.dl_total.store(FILES.iter().map(|f| f.1).sum(), Ordering::Relaxed);
    shared.dl_done.store(0, Ordering::Relaxed);
    let mut last_wake = std::time::Instant::now();

    for (name, _) in FILES {
        let dest = dir.join(name);
        if dest.is_file() {
            shared.dl_done.fetch_add(std::fs::metadata(&dest)?.len(), Ordering::Relaxed);
            continue;
        }
        let part = dir.join(format!("{name}.part"));
        let resp = reqwest::get(format!("{BASE_URL}/{name}")).await?.error_for_status()?;
        let mut file = tokio::fs::File::create(&part).await?;
        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            tokio::io::AsyncWriteExt::write_all(&mut file, &chunk).await?;
            shared.dl_done.fetch_add(chunk.len() as u64, Ordering::Relaxed);
            if last_wake.elapsed().as_millis() > 100 {
                shared.wake();
                last_wake = std::time::Instant::now();
            }
        }
        tokio::io::AsyncWriteExt::flush(&mut file).await?;
        drop(file);
        tokio::fs::rename(&part, &dest).await?;
    }
    Ok(())
}

fn execution_config() -> anyhow::Result<ExecutionConfig> {
    // ONNX Runtime pide un único entorno por proceso.
    static ENV: std::sync::OnceLock<parakeet_rs::ort::environment::Environment> = std::sync::OnceLock::new();
    if ENV.get().is_none() {
        let _ = ENV.set(parakeet_rs::ort::init().build()?);
    }
    #[allow(unused_mut)]
    let mut cfg = ExecutionConfig::new().with_environment(ENV.get().unwrap().clone());
    #[cfg(feature = "coreml")]
    {
        cfg = cfg.with_execution_provider(parakeet_rs::ExecutionProvider::CoreML);
    }
    #[cfg(feature = "directml")]
    {
        cfg = cfg.with_execution_provider(parakeet_rs::ExecutionProvider::DirectML);
    }
    #[cfg(feature = "cuda")]
    {
        cfg = cfg.with_execution_provider(parakeet_rs::ExecutionProvider::Cuda);
    }
    Ok(cfg)
}

/// Descarga (si hace falta y se permite) y carga el modelo.
pub fn start_loading(shared: Arc<Shared>, rt: tokio::runtime::Handle, download_if_missing: bool) {
    rt.spawn(async move {
        *shared.engine.write().unwrap() = None;

        if !is_downloaded() {
            if !download_if_missing {
                shared.set_phase(Phase::NeedsModel);
                return;
            }
            shared.set_phase(Phase::Downloading);
            shared.note(format!("Descargando {MODEL_LABEL}…"));
            if let Err(e) = download(&shared).await {
                shared.note(format!("Falló la descarga: {e}"));
                shared.set_phase(Phase::Error(format!("Descarga fallida: {e}")));
                return;
            }
        }

        shared.set_phase(Phase::Loading);
        shared.note("Cargando el modelo en memoria…");
        let res = tokio::task::spawn_blocking(|| -> anyhow::Result<ParakeetTDT> {
            let cfg = execution_config()?;
            Ok(ParakeetTDT::from_pretrained(model_dir(), Some(cfg))?)
        })
        .await;
        match res {
            Ok(Ok(m)) => {
                *shared.engine.write().unwrap() = Some(Arc::new(Mutex::new(m)));
                shared.note("Modelo listo");
                shared.set_phase(Phase::Ready);
            }
            Ok(Err(e)) => {
                shared.note(format!("No se pudo cargar: {e}"));
                shared.set_phase(Phase::Error(format!("No se pudo cargar el modelo: {e}")));
            }
            Err(e) => shared.set_phase(Phase::Error(format!("Error interno: {e}"))),
        }
    });
}
