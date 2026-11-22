//! Interfaz (egui): estado del servidor, modelo, medidor de audio y vista previa del texto.

use std::sync::atomic::Ordering;
use std::sync::Arc;

use eframe::egui::{self, Color32, CornerRadius, FontId, RichText, Stroke, Vec2};

use crate::models;
use crate::state::{Phase, Shared};

const BG: Color32 = Color32::from_rgb(15, 17, 23);
const CARD: Color32 = Color32::from_rgb(24, 27, 36);
const CARD_HI: Color32 = Color32::from_rgb(34, 38, 50);
const TEXT: Color32 = Color32::from_rgb(232, 235, 243);
const MUTED: Color32 = Color32::from_rgb(140, 148, 168);
const ACCENT: Color32 = Color32::from_rgb(99, 130, 255);
const GREEN: Color32 = Color32::from_rgb(52, 211, 153);
const AMBER: Color32 = Color32::from_rgb(251, 191, 36);
const RED: Color32 = Color32::from_rgb(248, 113, 113);

pub struct App {
    shared: Arc<Shared>,
    rt: tokio::runtime::Handle,
    smooth_level: f32,
    show_log: bool,
}

impl App {
    pub fn new(cc: &eframe::CreationContext<'_>, shared: Arc<Shared>, rt: tokio::runtime::Handle) -> Self {
        *shared.repaint.lock().unwrap() = Some(cc.egui_ctx.clone());
        style(&cc.egui_ctx);
        Self { shared, rt, smooth_level: 0.0, show_log: false }
    }
}

fn style(ctx: &egui::Context) {
    let mut v = egui::Visuals::dark();
    v.panel_fill = BG;
    v.window_fill = CARD;
    v.override_text_color = Some(TEXT);
    v.widgets.noninteractive.bg_fill = CARD;
    v.widgets.inactive.bg_fill = CARD_HI;
    v.widgets.inactive.weak_bg_fill = CARD_HI;
    v.widgets.hovered.bg_fill = Color32::from_rgb(44, 49, 65);
    v.widgets.hovered.weak_bg_fill = Color32::from_rgb(44, 49, 65);
    v.widgets.active.bg_fill = ACCENT;
    v.widgets.active.weak_bg_fill = ACCENT;
    v.selection.bg_fill = ACCENT.gamma_multiply(0.5);
    let r = CornerRadius::same(10);
    v.widgets.noninteractive.corner_radius = r;
    v.widgets.inactive.corner_radius = r;
    v.widgets.hovered.corner_radius = r;
    v.widgets.active.corner_radius = r;
    v.widgets.inactive.bg_stroke = Stroke::NONE;
    v.widgets.noninteractive.bg_stroke = Stroke::NONE;
    ctx.set_visuals(v);
    ctx.global_style_mut(|s| {
        s.spacing.item_spacing = Vec2::new(10.0, 10.0);
        s.spacing.button_padding = Vec2::new(14.0, 8.0);
    });
}

fn card<R>(ui: &mut egui::Ui, add: impl FnOnce(&mut egui::Ui) -> R) -> R {
    egui::Frame::new()
        .fill(CARD)
        .corner_radius(CornerRadius::same(16))
        .inner_margin(egui::Margin::same(18))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            add(ui)
        })
        .inner
}

fn label(ui: &mut egui::Ui, t: &str) {
    ui.label(RichText::new(t.to_uppercase()).size(11.0).color(MUTED).strong());
}

fn pill(ui: &mut egui::Ui, text: &str, color: Color32) {
    egui::Frame::new()
        .fill(color.gamma_multiply(0.16))
        .corner_radius(CornerRadius::same(255))
        .inner_margin(egui::Margin::symmetric(12, 5))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 6.0;
                let (rect, _) = ui.allocate_exact_size(Vec2::splat(8.0), egui::Sense::hover());
                ui.painter().circle_filled(rect.center(), 4.0, color);
                ui.label(RichText::new(text).color(color).strong().size(13.0));
            });
        });
}

fn primary_button(text: &str) -> egui::Button<'static> {
    egui::Button::new(RichText::new(text).color(Color32::WHITE).strong()).fill(ACCENT)
}

impl eframe::App for App {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        let phase = self.shared.phase();
        let clients = self.shared.clients.load(Ordering::Relaxed);

        // El medidor decae suave; mientras haya actividad, repinta.
        let target = (self.shared.level() * 9.0).min(1.0);
        self.smooth_level += (target - self.smooth_level) * if target > self.smooth_level { 0.6 } else { 0.12 };
        if clients > 0 || self.smooth_level > 0.01 || matches!(phase, Phase::Downloading | Phase::Loading) {
            ctx.request_repaint_after(std::time::Duration::from_millis(33));
        }

        egui::CentralPanel::default()
            .frame(egui::Frame::new().fill(BG).inner_margin(egui::Margin::same(22)))
            .show(ui, |ui| {
                egui::ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| {
                    self.header(ui, &phase);
                    ui.add_space(4.0);
                    self.server_card(ui, &phase, clients);
                    self.model_card(ui, &phase);
                    self.transcript_card(ui);
                    self.log_section(ui);
                });
            });
    }
}

impl App {
    fn header(&mut self, ui: &mut egui::Ui, phase: &Phase) {
        ui.horizontal(|ui| {
            ui.vertical(|ui| {
                ui.label(RichText::new("Hymns STT").font(FontId::proportional(28.0)).strong());
                ui.label(RichText::new("Transcripción local con Whisper").color(MUTED));
            });
            ui.with_layout(egui::Layout::right_to_left(egui::Align::TOP), |ui| {
                let (t, c) = match phase {
                    Phase::Ready => ("Listo", GREEN),
                    Phase::Loading => ("Cargando modelo", AMBER),
                    Phase::Downloading => ("Descargando", AMBER),
                    Phase::NeedsModel => ("Falta el modelo", AMBER),
                    Phase::Error(_) => ("Error", RED),
                };
                pill(ui, t, c);
            });
        });
    }

    fn server_card(&mut self, ui: &mut egui::Ui, phase: &Phase, clients: usize) {
        card(ui, |ui| {
            label(ui, "Servidor local");
            ui.horizontal(|ui| {
                let (txt, col) = if clients > 0 {
                    (format!("{clients} cliente{} conectado{}", if clients > 1 { "s" } else { "" }, if clients > 1 { "s" } else { "" }), GREEN)
                } else {
                    ("Esperando a la página /transcripcion".into(), MUTED)
                };
                ui.label(RichText::new(txt).color(col));
            });

            // Medidor de audio entrante.
            let (rect, _) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 10.0), egui::Sense::hover());
            ui.painter().rect_filled(rect, CornerRadius::same(5), CARD_HI);
            let mut fill = rect;
            fill.set_width((rect.width() * self.smooth_level).max(0.0));
            let col = if self.smooth_level > 0.85 { AMBER } else { GREEN };
            ui.painter().rect_filled(fill, CornerRadius::same(5), col);

            if let Phase::Error(e) = phase {
                ui.label(RichText::new(e).color(RED));
            }
        });
    }

    fn model_card(&mut self, ui: &mut egui::Ui, phase: &Phase) {
        card(ui, |ui| {
            label(ui, "Modelo");
            ui.label(RichText::new(models::MODEL_LABEL).size(16.0).strong());
            ui.label(
                RichText::new("Transductor RNN-T de NVIDIA · 25 idiomas (español incluido) · detecta el idioma y puntúa solo")
                    .color(MUTED)
                    .size(12.5),
            );

            match phase {
                Phase::NeedsModel | Phase::Error(_) => {
                    let txt = if models::is_downloaded() { "Cargar modelo".to_string() } else { format!("Descargar ({} MB)", models::total_mb()) };
                    if ui.add(primary_button(&txt)).clicked() {
                        models::start_loading(self.shared.clone(), self.rt.clone(), true);
                    }
                }
                Phase::Downloading => {
                    let done = self.shared.dl_done.load(Ordering::Relaxed) as f32;
                    let total = self.shared.dl_total.load(Ordering::Relaxed).max(1) as f32;
                    ui.add(
                        egui::ProgressBar::new(done / total)
                            .fill(ACCENT)
                            .text(format!("{:.0} / {:.0} MB", done / 1e6, total / 1e6)),
                    );
                }
                Phase::Loading => {
                    ui.horizontal(|ui| {
                        ui.spinner();
                        ui.label(RichText::new("Cargando en memoria (unos segundos)…").color(MUTED));
                    });
                }
                Phase::Ready => {}
            }
        });
    }

    fn transcript_card(&mut self, ui: &mut egui::Ui) {
        card(ui, |ui| {
            label(ui, "Vista previa en vivo");
            let lines = self.shared.transcript.lock().unwrap().clone();
            egui::ScrollArea::vertical().max_height(180.0).stick_to_bottom(true).auto_shrink([false, true]).show(ui, |ui| {
                ui.set_min_height(60.0);
                if lines.is_empty() {
                    ui.label(RichText::new("Aquí aparecerá lo que se transcriba.").color(MUTED));
                }
                for l in lines.iter().rev().take(12).rev() {
                    let c = if l.is_final { TEXT } else { MUTED };
                    ui.label(RichText::new(&l.text).color(c).size(15.0));
                }
            });
        });
    }


    fn log_section(&mut self, ui: &mut egui::Ui) {
        ui.checkbox(&mut self.show_log, "Mostrar registro");
        if self.show_log {
            card(ui, |ui| {
                for n in self.shared.notes.lock().unwrap().iter() {
                    ui.label(RichText::new(n).monospace().size(12.0).color(MUTED));
                }
            });
        }
    }
}
