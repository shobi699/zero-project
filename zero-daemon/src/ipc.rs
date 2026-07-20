use std::sync::{Arc, Mutex, OnceLock};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};
use tokio::sync::broadcast;
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};

use crate::overlay::OverlayState;
use crate::DaemonCmd;

/// One-shot sender for returning the transcribed text from RecordForNotepad
/// back to the IPC handler that requested it.
pub type NotepadReplyTx = std::sync::mpsc::Sender<String>;

pub static IPC_SERVER: OnceLock<Arc<IpcServer>> = OnceLock::new();
static CMD_TX: OnceLock<std::sync::mpsc::Sender<DaemonCmd>> = OnceLock::new();

pub fn get_ipc_server() -> Option<&'static Arc<IpcServer>> {
    IPC_SERVER.get()
}

/// Register the daemon command channel so IPC requests (TriggerRecord) can
/// actually drive the recording loop.
pub fn set_cmd_sender(tx: std::sync::mpsc::Sender<DaemonCmd>) {
    let _ = CMD_TX.set(tx);
}

// Protocol: newline-delimited JSON in both directions. Every request gets
// exactly one reply line; unsolicited events are only pushed to connections
// that sent a `Subscribe` request.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum IpcRequest {
    GetStatus,
    TriggerRecord,
    RecordForNotepad,
    UpdateSettings { settings: String },
    Subscribe,
    GetConfig,
    SetConfig { config: String },
    GetModelStatus,
    SetActiveModel { model_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum IpcResponse {
    StatusUpdate { status: String },
    Transcription { text: String, strategy: String },
    TranscriptionResult { text: String },
    ErrorMsg { message: String },
    Ack { ok: bool },
    Config { config: String },
    ModelStatus { models: String },
}

pub struct IpcServer {
    tx: broadcast::Sender<IpcResponse>,
    status: Mutex<String>,
}

impl IpcServer {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(100);
        Self {
            tx,
            status: Mutex::new("Idle".to_string()),
        }
    }

    pub fn start(self: Arc<Self>) {
        tokio::spawn(async move {
            let pipe_name = r"\\.\pipe\zero-ipc";
            info!("Starting Named Pipe IPC server on {}", pipe_name);

            let mut is_first = true;
            loop {
                // Set up the named pipe server instance
                let server = match ServerOptions::new()
                    .first_pipe_instance(is_first)
                    .create(pipe_name)
                {
                    Ok(s) => {
                        is_first = false;
                        s
                    }
                    Err(e) => {
                        error!("Failed to create named pipe instance: {}", e);
                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                        continue;
                    }
                };

                // Wait for a client to connect
                match server.connect().await {
                    Ok(_) => {
                        info!("Tauri Studio connected to IPC pipe");
                        let self_clone = Arc::clone(&self);
                        let rx = self_clone.tx.subscribe();
                        tokio::spawn(handle_client(server, rx, self_clone));
                    }
                    Err(e) => {
                        warn!("Error waiting for pipe client connection: {}", e);
                    }
                }
            }
        });
    }

    pub fn broadcast_status(&self, state: OverlayState) {
        let status_str = match state {
            OverlayState::Hidden => "Idle",
            OverlayState::Listening => "Listening",
            OverlayState::Processing => "Processing",
            OverlayState::Success => "Success",
            OverlayState::Error => "Error",
        };

        {
            let mut s = self.status.lock().unwrap();
            *s = status_str.to_string();
        }

        let _ = self.tx.send(IpcResponse::StatusUpdate {
            status: status_str.to_string(),
        });
    }

    pub fn broadcast_transcription(&self, text: String, strategy: String) {
        let _ = self.tx.send(IpcResponse::Transcription { text, strategy });
    }

    pub fn broadcast_error(&self, message: String) {
        let _ = self.tx.send(IpcResponse::ErrorMsg { message });
    }

    fn current_status(&self) -> String {
        self.status.lock().unwrap().clone()
    }
}

async fn write_frame(
    writer: &mut (impl tokio::io::AsyncWrite + Unpin),
    msg: &IpcResponse,
) -> std::io::Result<()> {
    let mut bytes = serde_json::to_vec(msg).map_err(std::io::Error::other)?;
    bytes.push(b'\n');
    writer.write_all(&bytes).await
}

async fn handle_client(
    mut server: NamedPipeServer,
    mut event_rx: broadcast::Receiver<IpcResponse>,
    server_state: Arc<IpcServer>,
) {
    let (reader, mut writer) = tokio::io::split(&mut server);
    let mut reader = BufReader::new(reader);
    let mut line = String::new();
    let mut subscribed = false;

    loop {
        tokio::select! {
            // Read from client (one JSON message per line)
            read_res = reader.read_line(&mut line) => {
                match read_res {
                    Ok(0) => {
                        info!("Tauri Studio disconnected from pipe");
                        break;
                    }
                    Ok(_) => {
                        let reply = match serde_json::from_str::<IpcRequest>(line.trim()) {
                            Ok(IpcRequest::GetStatus) => IpcResponse::StatusUpdate {
                                status: server_state.current_status(),
                            },
                            Ok(IpcRequest::TriggerRecord) => {
                                info!("IPC TriggerRecord received");
                                let ok = CMD_TX
                                    .get()
                                    .is_some_and(|tx| tx.send(DaemonCmd::ToggleRecording).is_ok());
                                IpcResponse::Ack { ok }
                            }
                            Ok(IpcRequest::RecordForNotepad) => {
                                info!("IPC RecordForNotepad received");
                                let (reply_tx, reply_rx) = std::sync::mpsc::channel();
                                let sent = CMD_TX
                                    .get()
                                    .is_some_and(|tx| tx.send(DaemonCmd::RecordForNotepad(reply_tx)).is_ok());
                                if !sent {
                                    IpcResponse::ErrorMsg {
                                        message: "daemon not available".to_string(),
                                    }
                                } else {
                                    // Block (in a thread) waiting for the daemon to finish STT.
                                    match std::thread::spawn(move || {
                                        reply_rx.recv_timeout(std::time::Duration::from_secs(60))
                                    }).join() {
                                        Ok(Ok(text)) => IpcResponse::TranscriptionResult { text },
                                        Ok(Err(_)) => IpcResponse::ErrorMsg {
                                            message: "timeout waiting for transcription".to_string(),
                                        },
                                        Err(_) => IpcResponse::ErrorMsg {
                                            message: "daemon thread panicked".to_string(),
                                        },
                                    }
                                }
                            }
                            Ok(IpcRequest::UpdateSettings { settings }) => {
                                info!("IPC UpdateSettings received: {}", settings);
                                match serde_json::from_str::<SettingsPayload>(&settings) {
                                    Ok(payload) => {
                                        let ok = match crate::hotkey::update_hotkey_from_string(&payload.hotkey) {
                                            Ok(()) => true,
                                            Err(e) => {
                                                error!("Failed to update hotkey from settings: {}", e);
                                                false
                                            }
                                        };
                                        // Apply overlay mode if provided
                                        if let Some(ref mode) = payload.overlay_mode {
                                            let overlay_mode = match mode.as_str() {
                                                "corner" => crate::overlay::OverlayMode::Corner,
                                                _ => crate::overlay::OverlayMode::Cursor,
                                            };
                                            crate::overlay::set_overlay_mode(overlay_mode);
                                        }
                                        // Persist all settings to config (hotkey, engine, unload_timeout, overlay_mode)
                                        crate::config::update_config(|c| {
                                            c.hotkey = payload.hotkey;
                                            c.engine_mode = payload.engine;
                                            c.unload_timeout = payload.unload_timeout;
                                            if let Some(ref mode) = payload.overlay_mode {
                                                c.overlay_mode = mode.clone();
                                            }
                                        });
                                        IpcResponse::Ack { ok }
                                    }
                                    Err(e) => {
                                        error!("Failed to parse settings JSON: {}", e);
                                        IpcResponse::ErrorMsg {
                                            message: "invalid settings payload".to_string(),
                                        }
                                    }
                                }
                            }
                            Ok(IpcRequest::Subscribe) => {
                                subscribed = true;
                                IpcResponse::Ack { ok: true }
                            }
                            Ok(IpcRequest::GetConfig) => {
                                let cfg = crate::config::get_config();
                                let json = serde_json::to_string(&cfg).unwrap_or_default();
                                IpcResponse::Config { config: json }
                            }
                            Ok(IpcRequest::SetConfig { config }) => {
                                match serde_json::from_str::<crate::config::DaemonConfig>(&config) {
                                    Ok(new_cfg) => {
                                        // Sync hotkey to live hook config
                                        let _ = crate::hotkey::update_hotkey_from_string(&new_cfg.hotkey);
                                        crate::config::update_config(|c| *c = new_cfg);
                                        IpcResponse::Ack { ok: true }
                                    }
                                    Err(e) => {
                                        error!("failed to parse config JSON: {}", e);
                                        IpcResponse::ErrorMsg {
                                            message: "invalid config payload".to_string(),
                                        }
                                    }
                                }
                            }
                            Ok(IpcRequest::GetModelStatus) => {
                                let models = crate::config::get_installed_models();
                                let json = serde_json::to_string(&models).unwrap_or_default();
                                IpcResponse::ModelStatus { models: json }
                            }
                            Ok(IpcRequest::SetActiveModel { model_id }) => {
                                let models_dir = crate::config::resolve_models_dir();
                                let model_path = models_dir.join(&model_id);
                                if model_path.exists() {
                                    crate::config::update_config(|c| c.active_model = model_id);
                                    IpcResponse::Ack { ok: true }
                                } else {
                                    warn!("SetActiveModel: model file not found: {}", model_path.display());
                                    IpcResponse::ErrorMsg {
                                        message: format!("model file not found: {}", model_id),
                                    }
                                }
                            }
                            Err(e) => {
                                warn!("invalid IPC request: {}", e);
                                IpcResponse::ErrorMsg {
                                    message: "invalid request".to_string(),
                                }
                            }
                        };
                        line.clear();
                        if let Err(e) = write_frame(&mut writer, &reply).await {
                            warn!("Failed to write IPC reply: {}", e);
                            break;
                        }
                    }
                    Err(e) => {
                        error!("Error reading from named pipe: {}", e);
                        break;
                    }
                }
            }
            // Push events only to subscribed clients so request/reply
            // connections never receive interleaved broadcasts.
            event_res = event_rx.recv() => {
                match event_res {
                    Ok(event) => {
                        if subscribed {
                            if let Err(e) = write_frame(&mut writer, &event).await {
                                warn!("Failed to write event to pipe: {}", e);
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
        }
    }
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct SettingsPayload {
    engine: String,
    hotkey: String,
    unload_timeout: u32,
    overlay_mode: Option<String>,
}
