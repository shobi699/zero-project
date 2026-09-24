use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use anyhow::{Context, Result};
use tracing::{error, info};

pub struct LocalEngine {
    executor_path: PathBuf,
    is_loaded: Mutex<bool>,
    last_used: Mutex<Instant>,
}

fn resolve_whisper_cli() -> PathBuf {
    let local_app_data = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Zero")
        .join("bin")
        .join("whisper-cli.exe");
    if local_app_data.exists() {
        return local_app_data;
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let candidate1 = exe_dir.join("bin").join("whisper-cli.exe");
            if candidate1.exists() {
                return candidate1;
            }
            let candidate2 = exe_dir.join("whisper-cli.exe");
            if candidate2.exists() {
                return candidate2;
            }
        }
    }

    let cwd_bin = PathBuf::from("bin").join("whisper-cli.exe");
    if cwd_bin.exists() {
        return cwd_bin;
    }

    local_app_data
}

fn resolve_model_path() -> Result<PathBuf> {
    let models_dir = crate::config::resolve_models_dir();
    let active_model = crate::config::get_config().active_model;
    let model_path = models_dir.join(&active_model);

    if model_path.exists() && crate::config::is_valid_ggml_model(&model_path) {
        return Ok(model_path);
    }

    // Try finding any valid installed model
    let installed = crate::config::get_installed_models();
    if let Some(fallback) = installed.first() {
        info!(
            "configured active model '{}' invalid, falling back to '{}'",
            active_model, fallback.filename
        );
        let fallback_path = models_dir.join(&fallback.filename);
        crate::config::update_config(|c| c.active_model = fallback.filename.clone());
        return Ok(fallback_path);
    }

    anyhow::bail!(
        "no valid Whisper GGML model found in {}",
        models_dir.display()
    )
}

impl LocalEngine {
    pub fn new() -> Self {
        let models_dir = crate::config::resolve_models_dir();
        let active_model = crate::config::get_config().active_model;
        Self::with_paths(
            models_dir.join(&active_model),
            resolve_whisper_cli(),
        )
    }

    pub fn with_paths(_model_path: PathBuf, executor_path: PathBuf) -> Self {
        Self {
            executor_path,
            is_loaded: Mutex::new(false),
            last_used: Mutex::new(Instant::now()),
        }
    }

    // Lazy load / verify the model
    pub fn load_model(&self) -> Result<()> {
        let mut loaded = self.is_loaded.lock().unwrap();
        if !*loaded {
            info!("Verifying local whisper model and executor...");

            let model_path = resolve_model_path()?;
            if !self.executor_path.exists() {
                anyhow::bail!(
                    "whisper-cli executor not found at {}",
                    self.executor_path.display()
                );
            }

            *loaded = true;
            let mut global_loaded = LOCAL_ENGINE_LOADED.lock().unwrap();
            *global_loaded = true;

            info!("Whisper model verified successfully: {}", model_path.display());
        }

        // Update last used timestamp
        let now = Instant::now();
        let mut last_used = self.last_used.lock().unwrap();
        *last_used = now;

        let mut global_last_used = LOCAL_ENGINE_LAST_USED.lock().unwrap();
        *global_last_used = Some(now);

        Ok(())
    }

    // Invalidate model so the next transcription re-verifies with current active model
    #[allow(dead_code)]
    pub fn invalidate_model(&self) {
        let mut loaded = self.is_loaded.lock().unwrap();
        *loaded = false;
        let mut global_loaded = LOCAL_ENGINE_LOADED.lock().unwrap();
        *global_loaded = false;
    }

    // Unload model to release RAM
    #[allow(dead_code)]
    pub fn unload_model(&self) {
        let mut loaded = self.is_loaded.lock().unwrap();
        if *loaded {
            info!("Inactivity threshold exceeded. Unloading Whisper model from RAM to release resources.");
            *loaded = false;
            let mut global_loaded = LOCAL_ENGINE_LOADED.lock().unwrap();
            *global_loaded = false;
        }
    }

    pub async fn transcribe(&self, wav_path: &Path) -> Result<String> {
        // Ensure verified (fails if model/executor are missing)
        self.load_model()?;

        let model_path = resolve_model_path()?;
        info!("transcribing locally using model: {}", model_path.display());

        #[allow(unused_mut)]
        let mut cmd = tokio::process::Command::new(&self.executor_path);
        #[cfg(target_os = "windows")]
        {
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        // Dynamically compute optimal compute threads (between 4 and 8)
        let num_threads = std::thread::available_parallelism()
            .map(|n| (n.get() / 2).clamp(4, 8).to_string())
            .unwrap_or_else(|_| "6".to_string());

        let output_future = cmd
            .arg("-m")
            .arg(&model_path)
            .arg("-f")
            .arg(wav_path)
            .arg("-nt")             // No timestamps
            .arg("-np")             // No prints (clean output)
            .arg("-sns")            // Suppress non-speech tokens (anti-hallucination)
            .arg("-nf")             // No temperature fallback
            .arg("-tp")
            .arg("0.0")             // Greedy decoding (highest accuracy & determinism)
            .arg("-nth")
            .arg("0.65")            // No-speech threshold
            .arg("-l")
            .arg("fa")              // Persian language
            .arg("-t")
            .arg(&num_threads)
            .output();

        let output = tokio::time::timeout(Duration::from_secs(60), output_future)
            .await
            .map_err(|_| anyhow::anyhow!("whisper-cli execution timed out after 60s"))?
            .context("failed to execute whisper-cli process")?;

        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            error!("whisper-cli execution failed: {}", err_msg);
            anyhow::bail!("local transcription failed: {}", err_msg);
        }

        let raw_stdout = String::from_utf8_lossy(&output.stdout);
        let text = raw_stdout
            .lines()
            .map(|l| l.trim())
            .filter(|l| {
                !l.is_empty()
                    && !l.starts_with("load_backend:")
                    && !l.starts_with("system_info:")
                    && !l.starts_with("read_audio_data:")
                    && !l.starts_with("whisper_")
            })
            .collect::<Vec<_>>()
            .join(" ")
            .trim()
            .to_string();

        Ok(text)
    }
}

// We can define a global/static state for clean unloading
pub static LOCAL_ENGINE_LOADED: Mutex<bool> = Mutex::new(false);
pub static LOCAL_ENGINE_LAST_USED: Mutex<Option<Instant>> = Mutex::new(None);

pub fn start_global_unload_watchdog() {
    tokio::spawn(async {
        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;

            let loaded = {
                let l = LOCAL_ENGINE_LOADED.lock().unwrap();
                *l
            };

            if loaded {
                let last_used = {
                    let lu = LOCAL_ENGINE_LAST_USED.lock().unwrap();
                    *lu
                };

                if let Some(time) = last_used {
                    if Instant::now().duration_since(time) > Duration::from_secs(300) {
                        info!("Inactivity threshold (5 mins) exceeded. Unloading Whisper model from RAM.");
                        let mut l = LOCAL_ENGINE_LOADED.lock().unwrap();
                        *l = false;
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn missing_engine() -> LocalEngine {
        LocalEngine::with_paths(
            PathBuf::from("test_non_existent_model.bin"),
            PathBuf::from("test_non_existent_whisper-cli.exe"),
        )
    }

    #[tokio::test]
    async fn test_load_model_fails_when_resources_missing() {
        let engine = missing_engine();

        // Initially not loaded
        {
            let loaded = engine.is_loaded.lock().unwrap();
            assert!(!*loaded);
        }

        // Loading must fail — the engine must never fabricate model files
        assert!(engine.load_model().is_err());

        // Still not loaded
        {
            let loaded = engine.is_loaded.lock().unwrap();
            assert!(!*loaded);
        }
    }

    #[tokio::test]
    async fn test_transcribe_fails_when_resources_missing() {
        let engine = missing_engine();
        let test_wav = Path::new("test_non_existent.wav");

        // Must return an error (so the router falls back to the deferred queue),
        // never canned placeholder text.
        assert!(engine.transcribe(test_wav).await.is_err());
    }
}
