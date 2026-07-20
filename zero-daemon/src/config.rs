use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::data_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonConfig {
    pub openai_api_key: String,
    pub active_model: String,
    pub engine_mode: String,
    pub hotkey: String,
    pub unload_timeout: u32,
    #[serde(default)]
    pub models_dir: String,
    /// STT mode: "browser" | "local" | "faster-whisper"
    #[serde(default = "default_stt_mode")]
    pub stt_mode: String,
    /// Overlay mode: "cursor" (follows cursor) | "corner" (fixed position)
    #[serde(default = "default_overlay_mode")]
    pub overlay_mode: String,
}

fn default_stt_mode() -> String {
    "browser".to_string()
}

fn default_overlay_mode() -> String {
    "cursor".to_string()
}

impl Default for DaemonConfig {
    fn default() -> Self {
        Self {
            openai_api_key: String::new(),
            active_model: "ggml-base.bin".to_string(),
            engine_mode: "hybrid".to_string(),
            hotkey: "Ctrl+Shift+Z".to_string(),
            unload_timeout: 5,
            models_dir: String::new(),
            stt_mode: "browser".to_string(),
            overlay_mode: "cursor".to_string(),
        }
    }
}

pub static CONFIG: OnceLock<Arc<Mutex<DaemonConfig>>> = OnceLock::new();

fn config_path() -> PathBuf {
    data_dir().join("config.json")
}

pub fn load_config() -> DaemonConfig {
    let path = config_path();
    match std::fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<DaemonConfig>(&content) {
            Ok(cfg) => {
                info!("loaded config from {}", path.display());
                cfg
            }
            Err(e) => {
                warn!("failed to parse config, using defaults: {}", e);
                DaemonConfig::default()
            }
        },
        Err(_) => {
            info!("no config file found, using defaults");
            DaemonConfig::default()
        }
    }
}

pub fn save_config(cfg: &DaemonConfig) -> anyhow::Result<()> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(cfg)?;
    std::fs::write(&path, json)?;
    info!("saved config to {}", path.display());
    Ok(())
}

pub fn get_config() -> DaemonConfig {
    CONFIG
        .get()
        .map(|c| c.lock().unwrap().clone())
        .unwrap_or_default()
}

pub fn update_config(f: impl FnOnce(&mut DaemonConfig)) {
    if let Some(cfg) = CONFIG.get() {
        let mut c = cfg.lock().unwrap();
        f(&mut c);
        if let Err(e) = save_config(&c) {
            warn!("failed to save config: {}", e);
        }
    }
}

pub fn init_config() {
    let cfg = load_config();
    let _ = CONFIG.set(Arc::new(Mutex::new(cfg)));
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledModel {
    pub id: String,
    pub filename: String,
    pub size_bytes: u64,
    pub is_active: bool,
}

/// Returns the resolved models directory path.
/// Uses custom path from config if set, otherwise defaults to %LOCALAPPDATA%\Zero\models
pub fn resolve_models_dir() -> PathBuf {
    let cfg = get_config();
    if !cfg.models_dir.is_empty() {
        return PathBuf::from(&cfg.models_dir);
    }
    // Default: %LOCALAPPDATA%\Zero\models (same as data_dir)
    data_dir().join("models")
}

pub fn get_installed_models() -> Vec<InstalledModel> {
    let models_dir = resolve_models_dir();
    let cfg = get_config();
    let mut models = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&models_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("bin") {
                let filename = path.file_name().unwrap().to_string_lossy().to_string();
                let meta = std::fs::metadata(&path).ok();
                models.push(InstalledModel {
                    id: filename.clone(),
                    filename,
                    size_bytes: meta.map(|m| m.len()).unwrap_or(0),
                    is_active: cfg.active_model == path.file_name().unwrap().to_string_lossy().as_ref(),
                });
            }
        }
    }

    models
}
