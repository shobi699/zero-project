use std::path::PathBuf;
use anyhow::Result;
use tokio::sync::mpsc;
use tracing::{error, info, warn};

use crate::audio;
use crate::clipboard;
use crate::local_engine::LocalEngine;
use crate::ws_client::{SttEvent, SttSession};

pub struct AudioRouter {
    local_engine: LocalEngine,
    tmp_dir: PathBuf,
    deferred_dir: PathBuf,
}

impl AudioRouter {
    pub fn new() -> Self {
        let base_dir = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Zero");
        let tmp_dir = base_dir.join("tmp");
        let deferred_dir = base_dir.join("deferred");
        let _ = std::fs::create_dir_all(&tmp_dir);
        let _ = std::fs::create_dir_all(&deferred_dir);

        let router = Self {
            local_engine: LocalEngine::new(),
            tmp_dir,
            deferred_dir,
        };

        // Start the background deferred queue processor
        router.start_deferred_queue_processor();

        router
    }

    /// Returns (text, is_transcribed). is_transcribed=false means the audio was
    /// saved to the deferred queue and `text` is the user-facing notice.
    /// On Err, the audio has NOT been persisted anywhere new — the caller must
    /// keep the encrypted temp file.
    pub async fn route_transcription(
        &self,
        all_pcm: Vec<u8>,
        ws_session: Option<SttSession>,
        stt_event_rx: &mut mpsc::UnboundedReceiver<SttEvent>,
    ) -> Result<(String, bool)> {
        // 1. Try Cloud WebSocket transcription if session is active
        if let Some(mut session) = ws_session {
            info!("attempting Cloud WebSocket transcription...");

            let mut success = true;
            if !all_pcm.is_empty() {
                if let Err(e) = session.send_audio(all_pcm.clone()).await {
                    warn!("failed to send audio to cloud: {}. falling back...", e);
                    success = false;
                }
            }

            if success {
                if let Err(e) = session.end_speech().await {
                    warn!("failed to end cloud speech: {}. falling back...", e);
                    success = false;
                }
            }

            if success {
                let timeout = tokio::time::timeout(
                    std::time::Duration::from_secs(8),
                    wait_for_result(stt_event_rx),
                )
                .await;

                match timeout {
                    Ok(Some(text)) => {
                        info!("Cloud WebSocket transcription successful");
                        let _ = session.close().await;
                        return Ok((text, true));
                    }
                    _ => {
                        warn!("Cloud transcription timed out or failed. falling back to local engine");
                    }
                }
            }
            let _ = session.close().await;
        }

        // 2. Check for silence / empty audio before running heavy local model
        if all_pcm.is_empty() || audio::is_silence(&all_pcm, 100.0) {
            info!("audio input is silence (RMS < 100), skipping transcription");
            return Ok((String::new(), true));
        }

        // 3. Try Local Engine fallback — whisper-cli needs a real WAV file
        info!("attempting Local Engine offline transcription...");
        let wav_bytes = audio::pcm_to_wav(&all_pcm);
        let local_wav = self.tmp_dir.join(format!("local_{}.wav", now_millis()));
        match std::fs::write(&local_wav, &wav_bytes) {
            Ok(()) => {
                let result = self.local_engine.transcribe(&local_wav).await;
                let _ = std::fs::remove_file(&local_wav);
                match result {
                    Ok(text) => {
                        info!("Local Engine transcription successful");
                        return Ok((text, true));
                    }
                    Err(e) => {
                        warn!("Local Engine transcription failed: {}. saving to deferred queue", e);
                    }
                }
            }
            Err(e) => {
                warn!("failed to write temp wav for local engine: {}. saving to deferred queue", e);
            }
        }

        // 3. Fallback: Save to Deferred Queue (as a valid WAV file)
        let deferred_path = self
            .deferred_dir
            .join(format!("deferred_{}.wav", now_millis()));

        match std::fs::write(&deferred_path, &wav_bytes) {
            Ok(()) => {
                info!("Audio saved to deferred queue at: {}", deferred_path.display());
                Ok((
                    "آفلاین — صوت ذخیره شد و پس از اتصال مجدد تبدیل خواهد شد".to_string(),
                    false,
                ))
            }
            Err(e) => {
                error!("Failed to save audio to deferred queue: {}", e);
                anyhow::bail!(
                    "Both cloud and local transcription failed, and deferred save failed: {}",
                    e
                );
            }
        }
    }

    fn start_deferred_queue_processor(&self) {
        let deferred_dir = self.deferred_dir.clone();

        tokio::spawn(async move {
            loop {
                // Poll every 30 seconds
                tokio::time::sleep(std::time::Duration::from_secs(30)).await;

                // Check if we have deferred files
                let files = match std::fs::read_dir(&deferred_dir) {
                    Ok(entries) => {
                        let mut f = Vec::new();
                        for entry in entries.flatten() {
                            let path = entry.path();
                            if path.is_file() && path.extension().is_some_and(|ext| ext == "wav") {
                                f.push(path);
                            }
                        }
                        f
                    }
                    Err(_) => continue,
                };

                if files.is_empty() {
                    continue;
                }

                let gateway_online = is_gateway_online().await;

                info!(
                    "Processing {} deferred audio files (gateway_online: {})...",
                    files.len(),
                    gateway_online
                );

                for file_path in files {
                    // Skip and delete corrupt or tiny files (< 1000 bytes)
                    if let Ok(meta) = std::fs::metadata(&file_path) {
                        if meta.len() < 1000 {
                            let _ = std::fs::remove_file(&file_path);
                            continue;
                        }
                    }

                    info!("processing deferred file: {}", file_path.display());

                    let text_opt = if gateway_online {
                        // Read PCM data from the WAV file (strip the 44-byte header)
                        let pcm_data = match read_pcm_from_wav(&file_path) {
                            Ok(data) => data,
                            Err(e) => {
                                error!("failed to read PCM from deferred file: {}. deleting", e);
                                let _ = std::fs::remove_file(&file_path);
                                continue;
                            }
                        };

                        // Establish temp WebSocket session
                        let (stt_tx, mut stt_event_rx) = mpsc::unbounded_channel();
                        let gateway_url = crate::config::get_config().gateway_url;
                        let ws_session = SttSession::connect(&gateway_url, stt_tx).await;

                        if let Ok(mut session) = ws_session {
                            let mut success = true;
                            if let Err(e) = session.send_audio(pcm_data).await {
                                error!("failed to send deferred audio: {}", e);
                                success = false;
                            }
                            let res = if success {
                                let _ = session.end_speech().await;
                                let timeout = tokio::time::timeout(
                                    std::time::Duration::from_secs(10),
                                    wait_for_result(&mut stt_event_rx),
                                )
                                .await;
                                match timeout {
                                    Ok(Some(text)) => Some(text),
                                    _ => None,
                                }
                            } else {
                                None
                            };
                            let _ = session.close().await;
                            res
                        } else {
                            None
                        }
                    } else {
                        // Offline: Process with local engine
                        let engine = LocalEngine::new();
                        match engine.transcribe(&file_path).await {
                            Ok(text) if !text.trim().is_empty() => Some(text),
                            Ok(_) => {
                                let _ = std::fs::remove_file(&file_path);
                                None
                            }
                            Err(e) => {
                                warn!("local engine failed on deferred file {}: {}. Removing unprocessable file.", file_path.display(), e);
                                let _ = std::fs::remove_file(&file_path);
                                None
                            }
                        }
                    };

                    if let Some(text) = text_opt {
                        info!("successfully transcribed deferred audio: {}", text);
                        let _ = clipboard::set_clipboard_text(&text);
                        if let Some(server) = crate::ipc::get_ipc_server() {
                            server.broadcast_transcription(
                                text.clone(),
                                "Deferred".to_string(),
                            );
                        }
                        crate::config::add_history(crate::config::HistoryEntry {
                            id: format!("h_{}", now_millis()),
                            text,
                            datetime: "معوقه".to_string(),
                            duration_secs: 0.0,
                            strategy: "clipboard".to_string(),
                            engine: if gateway_online { "cloud".to_string() } else { "local".to_string() },
                        });
                        let _ = std::fs::remove_file(&file_path);
                    }
                }
            }
        });
    }
}

fn now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis()
}

async fn is_gateway_online() -> bool {
    let gateway_url = crate::config::get_config().gateway_url;
    let addr = gateway_url.trim_start_matches("ws://");
    tokio::net::TcpStream::connect(addr).await.is_ok()
}

fn read_pcm_from_wav(path: &std::path::Path) -> Result<Vec<u8>> {
    let data = std::fs::read(path)?;
    if data.len() < 44 || &data[..4] != b"RIFF" || &data[8..12] != b"WAVE" {
        anyhow::bail!("invalid wav file");
    }
    // WAV PCM data starts after the 44-byte header
    Ok(data[44..].to_vec())
}

async fn wait_for_result(rx: &mut mpsc::UnboundedReceiver<SttEvent>) -> Option<String> {
    while let Some(event) = rx.recv().await {
        match event {
            SttEvent::Final(text) => return Some(text),
            SttEvent::Partial(_) => continue,
            SttEvent::Error(e) => {
                error!("STT error: {}", e);
                return None;
            }
        }
    }
    None
}
