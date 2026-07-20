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

impl LocalEngine {
    pub fn new() -> Self {
        let active_model = crate::config::get_config().active_model;
        let models_dir = crate::config::resolve_models_dir();
        let base_dir = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Zero");

        Self::with_paths(
            models_dir.join(&active_model),
            base_dir.join("bin").join("whisper-cli.exe"),
        )
    }

    pub fn with_paths(_model_path: PathBuf, executor_path: PathBuf) -> Self {
        Self {
            executor_path,
            is_loaded: Mutex::new(false),
            last_used: Mutex::new(Instant::now()),
        }
    }

    // Lazy load the model
    pub fn load_model(&self) -> Result<()> {
        let mut loaded = self.is_loaded.lock().unwrap();
        if !*loaded {
            info!("Lazy Loading local whisper model into memory...");

            // Re-read active model from config in case it changed
            let active_model = crate::config::get_config().active_model;
            let model_path = crate::config::resolve_models_dir().join(&active_model);

            // Verify model and executor exist — never fabricate them.
            if !model_path.exists() {
                anyhow::bail!(
                    "local whisper model not found at {}",
                    model_path.display()
                );
            }
            if !self.executor_path.exists() {
                anyhow::bail!(
                    "whisper-cli executor not found at {}",
                    self.executor_path.display()
                );
            }

            *loaded = true;
            let mut global_loaded = LOCAL_ENGINE_LOADED.lock().unwrap();
            *global_loaded = true;

            info!("Whisper model loaded successfully: {}", active_model);
        }

        // Update last used timestamp
        let now = Instant::now();
        let mut last_used = self.last_used.lock().unwrap();
        *last_used = now;

        let mut global_last_used = LOCAL_ENGINE_LAST_USED.lock().unwrap();
        *global_last_used = Some(now);

        Ok(())
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
        // Ensure loaded (lazy load); fails if model/executor are missing
        self.load_model()?;

        // Read active model from config each time
        let active_model = crate::config::get_config().active_model;
        let model_path = crate::config::resolve_models_dir().join(&active_model);

        info!("transcribing locally using model: {}", active_model);

        let output = tokio::process::Command::new(&self.executor_path)
            .arg("-m")
            .arg(&model_path)
            .arg("-f")
            .arg(wav_path)
            .arg("-nt")
            .output()
            .await
            .context("failed to execute whisper-cli process")?;

        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            error!("whisper-cli execution failed: {}", err_msg);
            anyhow::bail!("local transcription failed: {}", err_msg);
        }

        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
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
