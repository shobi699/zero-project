use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::data_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub text: String,
    pub datetime: String,
    pub duration_secs: f64,
    pub strategy: String,
    pub engine: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonConfig {
    pub openai_api_key: String,
    pub active_model: String,
    pub engine_mode: String,
    pub hotkey: String,
    #[serde(default = "default_hotkey_mode")]
    pub hotkey_mode: String,
    pub unload_timeout: u32,
    #[serde(default)]
    pub models_dir: String,
    /// STT mode: "browser" | "local" | "faster-whisper"
    #[serde(default = "default_stt_mode")]
    pub stt_mode: String,
    /// Overlay mode: "cursor" (follows cursor) | "corner" (fixed position)
    #[serde(default = "default_overlay_mode")]
    pub overlay_mode: String,
    /// WebSocket gateway URL for cloud STT
    #[serde(default = "default_gateway_url")]
    pub gateway_url: String,
    /// Enable translation mode: "off" | "fa-en" | "en-fa"
    #[serde(default)]
    pub translate_mode: String,
    /// Transcription history (last 10 entries)
    #[serde(default)]
    pub history: Vec<HistoryEntry>,
    /// Blacklisted process names (hotkey is ignored in these apps)
    #[serde(default)]
    pub blacklist: Vec<String>,
    /// Interactive preview mode (shows floating text box instead of instant injection)
    #[serde(default)]
    pub interactive_mode: bool,
    /// Auto-submit after injection (press Enter or Ctrl+Enter automatically)
    #[serde(default)]
    pub auto_submit: bool,
    /// Auto-submit key type: "enter" | "ctrl_enter"
    #[serde(default = "default_auto_submit_key")]
    pub auto_submit_key: String,
    /// Append a trailing space to injected text
    #[serde(default)]
    pub append_trailing_space: bool,
    /// Audio feedback beep sounds on recording start/stop
    #[serde(default)]
    pub audio_feedback: bool,
    /// VAD silence auto-stop duration in seconds
    #[serde(default = "default_vad_silence_timeout")]
    pub vad_silence_timeout: f32,
    /// LLM Polish mode: "off" | "grammar" | "formal" | "informal" | <custom_prompt_id>
    #[serde(default)]
    pub polish_mode: String,
    
    /// LLM Provider: "openai", "ollama", "groq", "lmstudio", "gemini", "custom"
    #[serde(default = "default_llm_provider")]
    pub llm_provider: String,
    
    /// LLM Endpoint (e.g. http://localhost:11434/v1 or https://api.openai.com/v1)
    #[serde(default = "default_llm_endpoint")]
    pub llm_endpoint: String,
    
    /// API Key for the LLM Provider
    #[serde(default)]
    pub llm_api_key: String,
    
    /// Model name to use (e.g. gpt-4o-mini, llama3)
    #[serde(default = "default_llm_model")]
    pub llm_model: String,

    /// Whether Right Panel (Edge Dock) is enabled and auto-launched
    #[serde(default = "default_enable_right_panel")]
    pub enable_right_panel: bool,
}

fn default_enable_right_panel() -> bool {
    true
}

fn default_auto_submit_key() -> String {
    "enter".to_string()
}

fn default_hotkey_mode() -> String {
    "toggle".to_string()
}

fn default_vad_silence_timeout() -> f32 {
    2.0
}

fn default_stt_mode() -> String {
    "local".to_string()
}

fn default_overlay_mode() -> String {
    "cursor".to_string()
}

fn default_gateway_url() -> String {
    "ws://127.0.0.1:9009".to_string()
}

fn default_llm_provider() -> String {
    "openai".to_string()
}

fn default_llm_endpoint() -> String {
    "https://api.openai.com/v1".to_string()
}

fn default_llm_model() -> String {
    "gpt-4o-mini".to_string()
}

impl Default for DaemonConfig {
    fn default() -> Self {
        Self {
            openai_api_key: String::new(),
            active_model: "ggml-base.bin".to_string(),
            engine_mode: "hybrid".to_string(),
            hotkey: "Ctrl+Shift+Z".to_string(),
            hotkey_mode: default_hotkey_mode(),
            unload_timeout: 300,
            models_dir: String::new(),
            stt_mode: default_stt_mode(),
            overlay_mode: default_overlay_mode(),
            gateway_url: default_gateway_url(),
            translate_mode: "off".to_string(),
            history: Vec::new(),
            blacklist: Vec::new(),
            interactive_mode: false,
            auto_submit: false,
            auto_submit_key: default_auto_submit_key(),
            append_trailing_space: false,
            audio_feedback: true,
            vad_silence_timeout: default_vad_silence_timeout(),
            polish_mode: "off".to_string(),
            llm_provider: default_llm_provider(),
            llm_endpoint: default_llm_endpoint(),
            llm_api_key: String::new(),
            llm_model: default_llm_model(),
            enable_right_panel: default_enable_right_panel(),
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

/// Check if a file is a valid GGML/GGUF model file
pub fn is_valid_ggml_model(path: &std::path::Path) -> bool {
    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return false,
    };
    if meta.len() < 10_000_000 {
        return false;
    }

    use std::io::Read;
    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return false,
    };
    let mut magic = [0u8; 4];
    if file.read_exact(&mut magic).is_err() {
        return false;
    }

    // "ggml" (0x67676d6c), "ggmf", "ggmv" in little-endian, or "GGUF"
    magic == [0x6c, 0x6d, 0x67, 0x67]
        || magic == [0x66, 0x6d, 0x67, 0x67]
        || magic == [0x76, 0x6d, 0x67, 0x67]
        || magic == *b"GGUF"
}

pub fn get_installed_models() -> Vec<InstalledModel> {
    let models_dir = resolve_models_dir();
    let cfg = get_config();
    let mut models = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&models_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let is_bin_or_gguf = path
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|ext| ext == "bin" || ext == "gguf");
            if is_bin_or_gguf && is_valid_ggml_model(&path) {
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

/// Add a history entry (keeps last 10)
pub fn add_history(entry: HistoryEntry) {
    update_config(|c| {
        c.history.insert(0, entry);
        c.history.truncate(10);
    });
}

/// Delete a single history entry by id
pub fn delete_history(id: &str) {
    update_config(|c| {
        c.history.retain(|e| e.id != id);
    });
}

/// Delete all history entries
pub fn delete_all_history() {
    update_config(|c| {
        c.history.clear();
    });
}

/// Get blacklist
pub fn get_blacklist() -> Vec<String> {
    get_config().blacklist
}

/// Add to blacklist
pub fn add_to_blacklist(process: String) {
    update_config(|c| {
        if !c.blacklist.contains(&process) {
            c.blacklist.push(process);
        }
    });
}

/// Remove from blacklist
pub fn remove_from_blacklist(process: &str) {
    update_config(|c| {
        c.blacklist.retain(|p| p != process);
    });
}

/// Delete all user data (history, blacklist, config, tmp files, models)
pub fn delete_all_data() -> anyhow::Result<()> {
    let base = data_dir();
    // Clear history and blacklist
    update_config(|c| {
        c.history.clear();
        c.blacklist.clear();
    });
    // Remove tmp directory
    let _ = std::fs::remove_dir_all(base.join("tmp"));
    // Remove deferred directory
    let _ = std::fs::remove_dir_all(base.join("deferred"));
    info!("all user data deleted");
    Ok(())
}

/// Usage statistics computed from history
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageStats {
    pub total_entries: usize,
    pub total_duration_secs: f64,
    pub total_words: usize,
    pub avg_duration_secs: f64,
    pub by_engine: std::collections::HashMap<String, usize>,
}

/// Compute usage statistics from history
pub fn compute_usage_stats() -> UsageStats {
    let cfg = get_config();
    let history = &cfg.history;

    let total_entries = history.len();
    let total_duration_secs: f64 = history.iter().map(|e| e.duration_secs).sum();
    let total_words: usize = history.iter().map(|e| e.text.split_whitespace().count()).sum();
    let avg_duration_secs = if total_entries > 0 {
        total_duration_secs / total_entries as f64
    } else {
        0.0
    };

    let mut by_engine = std::collections::HashMap::new();
    for entry in history {
        *by_engine.entry(entry.engine.clone()).or_insert(0) += 1;
    }

    UsageStats {
        total_entries,
        total_duration_secs,
        total_words,
        avg_duration_secs,
        by_engine,
    }
}

pub fn start_remote_config_fetch() {
    tokio::spawn(async move {
        loop {
            // Wait 10 minutes between checks
            tokio::time::sleep(tokio::time::Duration::from_secs(600)).await;
            
            let url = {
                let cfg = get_config();
                let gateway = cfg.gateway_url.trim_end_matches('/');
                // Replace ws:// with http://
                let http_url = if gateway.starts_with("ws://") {
                    gateway.replacen("ws://", "http://", 1)
                } else if gateway.starts_with("wss://") {
                    gateway.replacen("wss://", "https://", 1)
                } else {
                    gateway.to_string()
                };
                format!("{}/api/settings/remote", http_url)
            };
            
            info!("fetching remote config from {}", url);
            match reqwest::get(&url).await {
                Ok(resp) => {
                    if let Ok(json) = resp.json::<serde_json::Value>().await {
                        // We could process remote config here (e.g. updating local settings limits)
                        // For now we just log it
                        info!("received remote config: {:?}", json);
                    }
                }
                Err(e) => {
                    warn!("failed to fetch remote config: {}", e);
                }
            }
        }
    });
}
