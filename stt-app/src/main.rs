// Sin consola en Windows en release.
#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

mod engine;
mod models;
mod server;
mod state;
mod ui;

fn main() -> eframe::Result {
    let shared = state::Shared::new();

    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("runtime");
    let handle = rt.handle().clone();

    handle.spawn(server::serve(shared.clone()));
    // Carga el modelo si ya está descargado; si no, la UI ofrece descargarlo.
    models::start_loading(shared.clone(), handle.clone(), false);

    let icon = eframe::icon_data::from_png_bytes(include_bytes!("../packaging/icons/icon.png"))
        .expect("icono embebido");
    let opts = eframe::NativeOptions {
        viewport: eframe::egui::ViewportBuilder::default()
            .with_title("Hymns STT")
            .with_icon(icon)
            .with_inner_size([560.0, 760.0])
            .with_min_inner_size([480.0, 600.0]),
        ..Default::default()
    };
    let result = eframe::run_native(
        "Hymns STT",
        opts,
        Box::new(move |cc| Ok(Box::new(ui::App::new(cc, shared, handle)))),
    );
    drop(rt);
    result
}
