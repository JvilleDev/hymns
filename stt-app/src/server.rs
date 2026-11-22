//! Servidor local: GET /health y WebSocket /ws en 127.0.0.1:8090.
//!
//! Protocolo WebSocket:
//!   cliente → {"type":"start"}   (opcional; el idioma lo detecta el modelo)
//!   cliente → frames binarios: PCM Int16 little-endian, mono, 16 kHz
//!   cliente → {"type":"flush"} cierra el enunciado actual; {"type":"stop"} lo cierra y termina
//!   servidor → {"type":"ready"} | {"type":"result","final":bool,"text":"…"} | {"type":"error","message":"…"}

use std::net::SocketAddr;
use std::sync::atomic::Ordering;
use std::sync::mpsc;
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{HeaderName, HeaderValue, Response};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{middleware, Json, Router};
use serde_json::{json, Value};
use tower_http::cors::{Any, CorsLayer};

use crate::engine::{self, In, Out};
use crate::state::{Phase, Shared, PORT};

pub async fn serve(shared: Arc<Shared>) {
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);
    let app = Router::new()
        .route("/health", get(health))
        .route("/ws", get(ws_upgrade))
        .layer(cors)
        // Chrome exige este encabezado para que una web https hable con localhost (Private Network Access).
        .layer(middleware::map_response(|mut r: Response<axum::body::Body>| async move {
            r.headers_mut().insert(
                HeaderName::from_static("access-control-allow-private-network"),
                HeaderValue::from_static("true"),
            );
            r
        }))
        .with_state(shared.clone());

    let addr = SocketAddr::from(([127, 0, 0, 1], PORT));
    match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => {
            shared.note(format!("Servidor escuchando en ws://localhost:{PORT}/ws"));
            if let Err(e) = axum::serve(l, app).await {
                shared.note(format!("El servidor se detuvo: {e}"));
            }
        }
        Err(e) => {
            shared.note(format!("No se pudo abrir el puerto {PORT}: {e}"));
            shared.set_phase(Phase::Error(format!("Puerto {PORT} ocupado (¿otra instancia abierta?)")));
        }
    }
}

async fn health(State(s): State<Arc<Shared>>) -> Json<Value> {
    Json(json!({
        "ok": true,
        "ready": s.phase() == Phase::Ready,
        "model": "parakeet-tdt-0.6b-v3",
        "clients": s.clients.load(Ordering::Relaxed),
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn ws_upgrade(ws: WebSocketUpgrade, State(s): State<Arc<Shared>>) -> impl IntoResponse {
    ws.on_upgrade(move |sock| handle(sock, s))
}

fn send_json(v: Value) -> Message {
    Message::Text(v.to_string().into())
}

async fn handle(mut sock: WebSocket, shared: Arc<Shared>) {
    shared.clients.fetch_add(1, Ordering::Relaxed);
    shared.wake();
    session(&mut sock, &shared).await;
    shared.clients.fetch_sub(1, Ordering::Relaxed);
    shared.set_level(0.0);
    shared.wake();
}

async fn session(sock: &mut WebSocket, shared: &Arc<Shared>) {
    let engine = shared.engine.read().unwrap().clone();
    let Some(engine) = engine else {
        let _ = sock
            .send(send_json(json!({"type":"error","code":"not_ready","message":"El modelo aún no está listo"})))
            .await;
        return;
    };

    // El motor arranca con el "start" o con el primer audio. Parakeet v3 detecta el idioma solo.
    let (in_tx, in_rx) = mpsc::channel::<In>();
    let (out_tx, mut out_rx) = tokio::sync::mpsc::unbounded_channel::<Out>();
    let mut worker: Option<std::thread::JoinHandle<()>> = None;
    let mut in_rx = Some(in_rx);

    let spawn = |in_rx: &mut Option<mpsc::Receiver<In>>| {
        let rx = in_rx.take()?;
        let (m, sh, tx) = (engine.clone(), shared.clone(), out_tx.clone());
        Some(std::thread::spawn(move || engine::run_session(m, sh, rx, tx)))
    };

    let _ = sock.send(send_json(json!({"type":"ready"}))).await;

    loop {
        tokio::select! {
            msg = sock.recv() => {
                let Some(Ok(msg)) = msg else { break };
                match msg {
                    Message::Binary(b) => {
                        if worker.is_none() { worker = spawn(&mut in_rx); }
                        let samples: Vec<f32> = b
                            .chunks_exact(2)
                            .map(|p| i16::from_le_bytes([p[0], p[1]]) as f32 / 32768.0)
                            .collect();
                        let _ = in_tx.send(In::Audio(samples));
                    }
                    Message::Text(t) => {
                        let v: Value = serde_json::from_str(&t).unwrap_or(Value::Null);
                        match v["type"].as_str() {
                            Some("start") => {
                                if worker.is_none() { worker = spawn(&mut in_rx); }
                            }
                            Some("flush") => { let _ = in_tx.send(In::Flush); }
                            Some("stop") => { let _ = in_tx.send(In::Flush); break; }
                            Some("ping") => { let _ = sock.send(send_json(json!({"type":"pong"}))).await; }
                            _ => {}
                        }
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
            out = out_rx.recv() => {
                let Some(out) = out else { break };
                let msg = match out {
                    Out::Result { text, is_final } => {
                        shared.push_result(&text, is_final);
                        json!({"type":"result","final":is_final,"text":text})
                    }
                };
                if sock.send(send_json(msg)).await.is_err() { break; }
            }
        }
    }

    // Cierre: el hilo emite el último final al recibir Close y termina; se espera sin bloquear el runtime.
    let _ = in_tx.send(In::Close);
    drop(out_tx);
    if let Some(w) = worker {
        // Entrega un último final pendiente (p. ej. tras "stop") antes de cerrar.
        let _ = tokio::task::spawn_blocking(move || { let _ = w.join(); }).await;
        while let Ok(out) = out_rx.try_recv() {
            let Out::Result { text, is_final } = out;
            shared.push_result(&text, is_final);
            let _ = sock.send(send_json(json!({"type":"result","final":is_final,"text":text}))).await;
        }
    }
    let _ = sock.send(send_json(json!({"type":"stopped"}))).await;
}
