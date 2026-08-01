#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod buffer;
mod clipboard;
mod config;
mod crypto;
mod db;
mod hotkey;
mod injector;
mod ipc;
mod local_engine;
mod overlay;
mod persian;
mod protocol;
mod router;
mod tray;
mod ws_client;

use std::path::PathBuf;
use std::sync::mpsc as std_mpsc;

use anyhow::Result;
use tokio::sync::mpsc;
use tracing::{error, info, warn};
use windows::Win32::Foundation::{LPARAM, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetMessageW, PostMessageW, TranslateMessage, MSG,
};

use crate::ws_client::SttEvent;
use crate::injector::TextInjector;

#[allow(dead_code)]
enum DaemonCmd {
    StartRecording,
    StopRecording,
    ToggleRecording,
    /// Record for the notepad — transcribed text is returned via the Sender
    /// instead of being injected at the OS cursor.
    RecordForNotepad(ipc::NotepadReplyTx),
    /// Start continuous meeting recording (long recording mode)
    StartMeeting,
    /// Stop meeting recording and transcribe
    StopMeeting(ipc::NotepadReplyTx),
    /// Inject text using the interactive preview snapshot
    InjectText(String),
    /// Cancel the interactive preview
    CancelPreview,
    Shutdown,
}

static LAST_SNAPSHOT: std::sync::OnceLock<std::sync::Mutex<Option<injector::DestinationSnapshot>>> = std::sync::OnceLock::new();

enum DaemonEvent {
    RecordingStarted,
    TranscriptionDone(String, injector::InjectionStrategy),
    Error(String),
}

fn data_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Zero")
}

fn main() -> Result<()> {
    tracing_subscriber::fmt::init();
    info!("zero-daemon starting");

    overlay::init_overlay();
    config::init_config();

    // Initialize notes database
    if let Err(e) = db::init_db() {
        warn!("failed to initialize notes database: {}", e);
    }

    // Apply saved overlay mode from config
    let cfg = config::get_config();
    let overlay_mode = match cfg.overlay_mode.as_str() {
        "corner" => overlay::OverlayMode::Corner,
        _ => overlay::OverlayMode::Cursor,
    };
    overlay::set_overlay_mode(overlay_mode);

    let ipc_server = std::sync::Arc::new(ipc::IpcServer::new());
    let _ = ipc::IPC_SERVER.set(std::sync::Arc::clone(&ipc_server));

    let mut tray_icon = tray::create_window_and_tray()?;
    let hwnd = tray_icon.hwnd();

    let (cmd_tx, cmd_rx) = std_mpsc::channel::<DaemonCmd>();
    let (event_tx, event_rx) = std_mpsc::channel::<DaemonEvent>();

    ipc::set_cmd_sender(cmd_tx.clone());

    let hotkey_mgr = hotkey::HotkeyManager::new();
    hotkey_mgr.register(cmd_tx.clone())?;
    
    // Apply saved hotkey from config
    if let Err(e) = hotkey::update_hotkey_from_string(&cfg.hotkey) {
        warn!("failed to apply saved hotkey '{}': {}", cfg.hotkey, e);
        info!("hotkey defaulted to: Ctrl+Shift+Z (low-level hook)");
    } else {
        info!("hotkey registered: {} (low-level hook)", cfg.hotkey);
    }

    let hwnd_raw = hwnd.0 as isize;
    let ipc_server_clone = std::sync::Arc::clone(&ipc_server);
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("tokio runtime");
        rt.block_on(async {
            ipc_server_clone.start();
            local_engine::start_global_unload_watchdog();
            daemon_loop(cmd_rx, event_tx, hwnd_raw).await;
        });
    });

    info!("entering message loop");
    run_message_loop(&mut tray_icon, &event_rx);

    let _ = cmd_tx.send(DaemonCmd::Shutdown);
    info!("zero-daemon exiting");
    Ok(())
}

fn run_message_loop(
    tray_icon: &mut tray::TrayIcon,
    event_rx: &std_mpsc::Receiver<DaemonEvent>,
) {
    let mut msg = MSG::default();
    loop {
        let ret = unsafe { GetMessageW(&mut msg, None, 0, 0) };
        if !ret.as_bool() {
            break;
        }

        if msg.message == tray::WM_DAEMON_EVENT {
            while let Ok(event) = event_rx.try_recv() {
                match event {
                    DaemonEvent::RecordingStarted => {
                        tray::show_balloon(tray_icon, "Zero", "ضبط شروع شد...");
                    }
                    DaemonEvent::TranscriptionDone(text, strategy) => {
                        match strategy {
                            injector::InjectionStrategy::ClipboardOnly => {
                                let _ = clipboard::set_clipboard_text(&text);
                                tray::show_balloon(tray_icon, "Zero", "کپی شد ✓");
                                info!(text = %text, "text copied to clipboard");
                            }
                            _ => {
                                tray::show_balloon(tray_icon, "Zero", "درج شد ✓");
                                info!(text = %text, strategy = ?strategy, "text injected successfully");
                            }
                        }
                    }
                    DaemonEvent::Error(msg) => {
                        warn!("error: {}", msg);
                        tray::show_balloon(tray_icon, "Zero", &msg);
                    }
                }
            }
        }

        unsafe {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

fn is_blacklisted(_process_name: &str) -> bool {
    // For now, no blacklist. In the future this will read from SQLite config.
    false
}

async fn daemon_loop(
    cmd_rx: std_mpsc::Receiver<DaemonCmd>,
    event_tx: std_mpsc::Sender<DaemonEvent>,
    hwnd_raw: isize,
) {
    let data = data_dir();
    let tmp_dir = data.join("tmp");
    let router = router::AudioRouter::new();

    let crypto = match crypto::AudioCrypto::load_or_create(&data) {
        Ok(c) => c,
        Err(e) => {
            error!("crypto init failed: {}", e);
            let _ = event_tx.send(DaemonEvent::Error(format!("خطای رمزنگاری: {}", e)));
            return;
        }
    };

    let recovered = buffer::recover_temp_files(&tmp_dir, &crypto);
    if !recovered.is_empty() {
        info!(
            "found {} orphaned temp files from previous session",
            recovered.len()
        );
    }

    let mut recording: Option<RecordingState> = None;

    loop {
        match cmd_rx.recv() {
            Ok(DaemonCmd::Shutdown) => {
                info!("daemon shutting down");
                break;
            }
            Ok(DaemonCmd::InjectText(text)) => {
                if let Some(mutex) = LAST_SNAPSHOT.get() {
                    if let Some(snapshot) = mutex.lock().unwrap().take() {
                        let event_tx_clone = event_tx.clone();
                        let hwnd_raw_clone = hwnd_raw;
                        tokio::spawn(async move {
                            let injector = TextInjector::new(std::sync::Arc::new(injector::Win32LowLevelInjector));
                            let strategy = injector.inject(&text, &snapshot).await;
                            let _ = event_tx_clone.send(DaemonEvent::TranscriptionDone(text.clone(), strategy));
                            if let Some(server) = crate::ipc::get_ipc_server() {
                                server.broadcast_transcription(text, format!("{:?}", strategy));
                            }
                            post_event(hwnd_raw_clone);
                        });
                    }
                }
            }
            Ok(DaemonCmd::CancelPreview) => {
                if let Some(mutex) = LAST_SNAPSHOT.get() {
                    let _ = mutex.lock().unwrap().take();
                }
            }
            Ok(DaemonCmd::StartRecording) => {
                if recording.is_none() {
                    let snapshot = injector::take_destination_snapshot();
                    if is_blacklisted(&snapshot.process_name) {
                        warn!("Process {} is blacklisted. Ignoring recording.", snapshot.process_name);
                        let _ = event_tx.send(DaemonEvent::Error("این برنامه در لیست سیاه است".into()));
                        post_event(hwnd_raw);
                        overlay::set_overlay_state(overlay::OverlayState::Error);
                        tokio::spawn(async {
                            tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                            overlay::set_overlay_state(overlay::OverlayState::Hidden);
                        });
                        continue;
                    }

                    info!("starting recording (PTT)");
                    match start_recording(&tmp_dir, crypto.clone(), &event_tx, hwnd_raw, snapshot, None).await {
                        Ok(state) => {
                            recording = Some(state);
                            overlay::set_overlay_state(overlay::OverlayState::Listening);
                        }
                        Err(e) => {
                            error!("failed to start recording: {}", e);
                            let _ = event_tx
                                .send(DaemonEvent::Error("میکروفون در دسترس نیست".into()));
                            post_event(hwnd_raw);
                            overlay::set_overlay_state(overlay::OverlayState::Error);
                            tokio::spawn(async {
                                tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                                overlay::set_overlay_state(overlay::OverlayState::Hidden);
                            });
                        }
                    }
                }
            }
            Ok(DaemonCmd::StopRecording) => {
                if let Some(state) = recording.take() {
                    info!("stopping recording (PTT)");
                    stop_and_transcribe(state, &event_tx, hwnd_raw, &router).await;
                }
            }
            Ok(DaemonCmd::ToggleRecording) => {
                if let Some(state) = recording.take() {
                    info!("stopping recording (Toggle)");
                    stop_and_transcribe(state, &event_tx, hwnd_raw, &router).await;
                } else {
                    let snapshot = injector::take_destination_snapshot();
                    if is_blacklisted(&snapshot.process_name) {
                        warn!("Process {} is blacklisted. Ignoring recording.", snapshot.process_name);
                        let _ = event_tx.send(DaemonEvent::Error("این برنامه در لیست سیاه است".into()));
                        post_event(hwnd_raw);
                        overlay::set_overlay_state(overlay::OverlayState::Error);
                        tokio::spawn(async {
                            tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                            overlay::set_overlay_state(overlay::OverlayState::Hidden);
                        });
                        continue;
                    }

                    info!("starting recording (Toggle)");
                    match start_recording(&tmp_dir, crypto.clone(), &event_tx, hwnd_raw, snapshot, None).await {
                        Ok(state) => {
                            recording = Some(state);
                            overlay::set_overlay_state(overlay::OverlayState::Listening);
                        }
                        Err(e) => {
                            error!("failed to start recording: {}", e);
                            let _ = event_tx
                                .send(DaemonEvent::Error("میکروفون در دسترس نیست".into()));
                            post_event(hwnd_raw);
                            overlay::set_overlay_state(overlay::OverlayState::Error);
                            tokio::spawn(async {
                                tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                                overlay::set_overlay_state(overlay::OverlayState::Hidden);
                            });
                        }
                    }
                }
            }
            Ok(DaemonCmd::RecordForNotepad(reply_tx)) => {
                if let Some(state) = recording.take() {
                    info!("stopping recording (Notepad)");
                    stop_and_transcribe(state, &event_tx, hwnd_raw, &router).await;
                } else {
                    let snapshot = injector::take_destination_snapshot();
                    if is_blacklisted(&snapshot.process_name) {
                        warn!("Process {} is blacklisted. Ignoring notepad recording.", snapshot.process_name);
                        let _ = reply_tx.send(String::new());
                        overlay::set_overlay_state(overlay::OverlayState::Error);
                        tokio::spawn(async {
                            tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                            overlay::set_overlay_state(overlay::OverlayState::Hidden);
                        });
                        continue;
                    }

                    info!("starting recording (Notepad)");
                    match start_recording(&tmp_dir, crypto.clone(), &event_tx, hwnd_raw, snapshot, Some(reply_tx)).await {
                        Ok(state) => {
                            recording = Some(state);
                            overlay::set_overlay_state(overlay::OverlayState::Listening);
                        }
                        Err(e) => {
                            error!("failed to start recording: {}", e);
                            let _ = event_tx
                                .send(DaemonEvent::Error("میکروفون در دسترس نیست".into()));
                            post_event(hwnd_raw);
                            overlay::set_overlay_state(overlay::OverlayState::Error);
                            tokio::spawn(async {
                                tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                                overlay::set_overlay_state(overlay::OverlayState::Hidden);
                            });
                        }
                    }
                }
            }
            Ok(DaemonCmd::StartMeeting) => {
                if recording.is_some() {
                    warn!("already recording, ignoring StartMeeting");
                    continue;
                }
                let snapshot = injector::take_destination_snapshot();
                info!("starting meeting recording (continuous mode)");
                match start_recording(&tmp_dir, crypto.clone(), &event_tx, hwnd_raw, snapshot, None).await {
                    Ok(state) => {
                        recording = Some(state);
                        overlay::set_overlay_state(overlay::OverlayState::Listening);
                    }
                    Err(e) => {
                        error!("failed to start meeting recording: {}", e);
                        overlay::set_overlay_state(overlay::OverlayState::Error);
                        tokio::spawn(async {
                            tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                            overlay::set_overlay_state(overlay::OverlayState::Hidden);
                        });
                    }
                }
            }
            Ok(DaemonCmd::StopMeeting(reply_tx)) => {
                if let Some(state) = recording.take() {
                    info!("stopping meeting recording, transcribing...");
                    // Use a longer timeout for meeting transcription
                    stop_and_transcribe_meeting(state, &event_tx, hwnd_raw, &router, reply_tx).await;
                } else {
                    let _ = reply_tx.send(String::new());
                }
            }
            Ok(DaemonCmd::Shutdown) | Err(_) => {
                if let Some(state) = recording.take() {
                    state.capture.stop();
                    overlay::set_overlay_state(overlay::OverlayState::Hidden);
                }
                break;
            }
        }
    }
}

struct RecordingState {
    capture: audio::CaptureHandle,
    /// Drains audio chunks into the encrypted temp buffer as they arrive, so a
    /// crash mid-recording always leaves a recoverable file on disk. Resolves
    /// with the buffer and the accumulated PCM once the capture stream closes.
    writer: tokio::task::JoinHandle<(buffer::TempBuffer, Vec<u8>)>,
    ws_session: Option<ws_client::SttSession>,
    stt_event_rx: mpsc::UnboundedReceiver<SttEvent>,
    snapshot: injector::DestinationSnapshot,
    /// When set, the transcribed text is sent here instead of being injected.
    notepad_reply: Option<ipc::NotepadReplyTx>,
    /// When recording started (for duration tracking)
    start_time: std::time::Instant,
}

async fn start_recording(
    tmp_dir: &std::path::Path,
    crypto: crypto::AudioCrypto,
    event_tx: &std_mpsc::Sender<DaemonEvent>,
    hwnd_raw: isize,
    snapshot: injector::DestinationSnapshot,
    notepad_reply: Option<ipc::NotepadReplyTx>,
) -> Result<RecordingState> {
    let (chunk_tx, mut audio_rx) = mpsc::unbounded_channel::<Vec<u8>>();

    let capture = audio::start_capture(chunk_tx)?;

    let mut temp_buffer = buffer::TempBuffer::create(tmp_dir, crypto)?;

    // Channel to stream chunks to the WebSocket session during recording
    let (stream_tx, mut stream_rx) = mpsc::unbounded_channel::<Vec<u8>>();

    let writer = tokio::spawn(async move {
        let mut all_pcm = Vec::new();
        while let Some(chunk) = audio_rx.recv().await {
            if let Err(e) = temp_buffer.write_chunk(&chunk) {
                warn!("failed to write audio chunk to temp buffer: {}", e);
            }
            // Forward chunk for real-time streaming
            let _ = stream_tx.send(chunk.clone());
            all_pcm.extend_from_slice(&chunk);
        }
        (temp_buffer, all_pcm)
    });

    // Connect WebSocket for real-time streaming
    let (stt_tx, _stt_event_rx) = mpsc::unbounded_channel();
    let gateway_url = crate::config::get_config().gateway_url;
    let ws_session = match ws_client::SttSession::connect(&gateway_url, stt_tx).await {
        Ok(s) => Some(s),
        Err(e) => {
            warn!("gateway not available: {} — recording locally only", e);
            None
        }
    };

    // Spawn real-time streaming: forward chunks to WebSocket as they arrive
    if let Some(mut session) = ws_session {
        tokio::spawn(async move {
            while let Some(chunk) = stream_rx.recv().await {
                if let Err(e) = session.send_audio(chunk).await {
                    warn!("real-time stream send failed: {}", e);
                    break;
                }
            }
            // Session dropped — end_speech handled by router on stop
        });
    }

    let _ = event_tx.send(DaemonEvent::RecordingStarted);
    post_event(hwnd_raw);

    // New connection for receiving transcription results
    let (result_tx, stt_event_rx) = mpsc::unbounded_channel();
    let result_session = ws_client::SttSession::connect(&gateway_url, result_tx).await.ok();

    Ok(RecordingState {
        capture,
        writer,
        ws_session: result_session,
        stt_event_rx,
        snapshot,
        notepad_reply,
        start_time: std::time::Instant::now(),
    })
}

/// Translate text via server gateway (HTTP POST to /translation)
async fn translate_text(text: &str, source_lang: &str, target_lang: &str) -> Result<String, anyhow::Error> {
    let cfg = crate::config::get_config();
    let base_url = cfg.gateway_url
        .replace("ws://", "http://")
        .replace("wss://", "https://");
    let url = format!("{}/translation", base_url);

    let client = reqwest::Client::new();
    let resp = client.post(&url)
        .json(&serde_json::json!({
            "text": text,
            "sourceLang": source_lang,
            "targetLang": target_lang,
        }))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await?;

    let data: serde_json::Value = resp.json().await?;
    if let Some(err) = data.get("error").and_then(|e| e.as_str()) {
        anyhow::bail!(err.to_string());
    }
    data.get("text")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| anyhow::anyhow!("no translation text in response"))
}

async fn stop_and_transcribe(
    mut state: RecordingState,
    event_tx: &std_mpsc::Sender<DaemonEvent>,
    hwnd_raw: isize,
    router: &router::AudioRouter,
) {
    // Dropping the capture stream closes the audio channel, which lets the
    // writer task drain the remaining chunks and finish.
    state.capture.stop();
    overlay::set_overlay_state(overlay::OverlayState::Processing);

    let (temp_buffer, all_pcm) = match state.writer.await {
        Ok(result) => result,
        Err(e) => {
            error!("audio writer task failed: {}", e);
            overlay::set_overlay_state(overlay::OverlayState::Error);
            if let Some(reply_tx) = state.notepad_reply {
                let _ = reply_tx.send(String::new());
            } else {
                let _ = event_tx.send(DaemonEvent::Error("خطای پردازش صدا".into()));
            }
            post_event(hwnd_raw);
            return;
        }
    };

    let enc_path = temp_buffer.finish();

    // Delegate transcription to AudioRouter
    match router.route_transcription(all_pcm, state.ws_session, &mut state.stt_event_rx).await {
        Ok((text, is_transcribed)) => {
            if is_transcribed {
                let mut text = persian::normalize_persian_text(&text);

                // Apply personal dictionary
                if let Ok(dict_pairs) = crate::db::get_dict_pairs() {
                    if !dict_pairs.is_empty() {
                        text = persian::apply_dictionary(&text, &dict_pairs);
                    }
                }

                // Check for voice edit commands
                if let Some(edited) = persian::apply_voice_commands(&text) {
                    info!(original = %text, edited = %edited, "voice command applied");
                    text = edited;
                }

                // Apply translation if mode is enabled
                let cfg = crate::config::get_config();
                if cfg.translate_mode != "off" {
                    let (source_lang, target_lang) = match cfg.translate_mode.as_str() {
                        "fa-en" => ("fa", "en"),
                        "en-fa" => ("en", "fa"),
                        _ => ("fa", "en"),
                    };
                    match translate_text(&text, source_lang, target_lang).await {
                        Ok(translated) => {
                            info!(original = %text, translated = %translated, "translation successful");
                            text = translated;
                        }
                        Err(e) => {
                            warn!("translation failed: {}, using original text", e);
                        }
                    }
                }

                overlay::set_overlay_state(overlay::OverlayState::Success);
                tokio::spawn(async {
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    overlay::set_overlay_state(overlay::OverlayState::Hidden);
                });

                // Record to history (last 10 entries)
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                let datetime = format!("{:04}/{:02}/{:02} {:02}:{:02}",
                    1400 + (now / 31536000) % 100,
                    (now / 2592000) % 12 + 1,
                    (now / 86400) % 30 + 1,
                    (now / 3600) % 24,
                    (now / 60) % 60,
                );
                let duration = state.start_time.elapsed().as_secs_f64();
                let id = format!("h_{}", now);
                crate::config::add_history(crate::config::HistoryEntry {
                    id,
                    text: text.clone(),
                    datetime,
                    duration_secs: duration,
                    strategy: "auto".to_string(),
                    engine: crate::config::get_config().engine_mode.clone(),
                });

                if let Some(reply_tx) = state.notepad_reply {
                    // Notepad mode: return text to Studio, skip injection.
                    let _ = reply_tx.send(text.clone());
                    info!(text = %text, "text returned to notepad (no injection)");
                } else {
                    // Check for voice snippets before injection
                    if let Ok(snippet_pairs) = crate::db::get_snippet_pairs() {
                        if let Some(snippet_text) = persian::check_snippets(&text, &snippet_pairs) {
                            info!(original = %text, snippet = %snippet_text, "snippet matched");
                            text = snippet_text;
                        }
                    }

                    // Normal mode: check if interactive preview is requested
                    let cfg = crate::config::get_config();
                    if cfg.interactive_mode {
                        LAST_SNAPSHOT.get_or_init(|| std::sync::Mutex::new(None))
                            .lock()
                            .unwrap()
                            .replace(state.snapshot);

                        let mut pt = windows::Win32::Foundation::POINT::default();
                        unsafe { let _ = windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut pt); }

                        if let Some(server) = crate::ipc::get_ipc_server() {
                            server.broadcast_transcription_preview(text.clone(), pt.x, pt.y);
                        }
                        info!(text = %text, "sent to interactive preview");
                    } else {
                        // Inject text at OS cursor.
                        let injector = TextInjector::new(std::sync::Arc::new(injector::Win32LowLevelInjector));
                        let strategy = injector.inject(&text, &state.snapshot).await;

                        let _ = event_tx.send(DaemonEvent::TranscriptionDone(text.clone(), strategy));
                        if let Some(server) = crate::ipc::get_ipc_server() {
                            server.broadcast_transcription(text, format!("{:?}", strategy));
                        }
                    }
                }
                post_event(hwnd_raw);
            } else {
                overlay::set_overlay_state(overlay::OverlayState::Error);
                tokio::spawn(async {
                    tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                    overlay::set_overlay_state(overlay::OverlayState::Hidden);
                });

                if let Some(reply_tx) = state.notepad_reply {
                    let _ = reply_tx.send(String::new());
                } else {
                    let _ = event_tx.send(DaemonEvent::Error(text.clone()));
                    if let Some(server) = crate::ipc::get_ipc_server() {
                        server.broadcast_error(text);
                    }
                }
                post_event(hwnd_raw);
            }
            // Delivered (transcribed) or safely persisted in the deferred queue —
            // only now may the encrypted temp file be removed.
            let _ = std::fs::remove_file(&enc_path);
        }
        Err(e) => {
            overlay::set_overlay_state(overlay::OverlayState::Error);
            tokio::spawn(async {
                tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                overlay::set_overlay_state(overlay::OverlayState::Hidden);
            });

            let error_msg = format!("خطای پردازش: {}", e);
            if let Some(reply_tx) = state.notepad_reply {
                let _ = reply_tx.send(String::new());
            } else {
                let _ = event_tx.send(DaemonEvent::Error(error_msg.clone()));
                if let Some(server) = crate::ipc::get_ipc_server() {
                    server.broadcast_error(error_msg);
                }
            }
            post_event(hwnd_raw);
            // Audio was NOT delivered anywhere — keep the encrypted temp file so
            // it is recovered on the next startup (audio is never lost).
            warn!(
                "keeping encrypted temp file for recovery: {}",
                enc_path.display()
            );
        }
    }
}

/// Stop meeting recording and transcribe the full audio.
/// Returns the complete transcript via reply_tx.
async fn stop_and_transcribe_meeting(
    mut state: RecordingState,
    _event_tx: &std_mpsc::Sender<DaemonEvent>,
    hwnd_raw: isize,
    router: &router::AudioRouter,
    reply_tx: ipc::NotepadReplyTx,
) {
    state.capture.stop();
    overlay::set_overlay_state(overlay::OverlayState::Processing);

    let (temp_buffer, all_pcm) = match state.writer.await {
        Ok(result) => result,
        Err(e) => {
            error!("audio writer task failed: {}", e);
            let _ = reply_tx.send(String::new());
            overlay::set_overlay_state(overlay::OverlayState::Hidden);
            post_event(hwnd_raw);
            return;
        }
    };

    let enc_path = temp_buffer.finish();
    let duration_secs = all_pcm.len() as f64 / 32000.0; // 16kHz mono 16-bit

    info!(
        pcm_bytes = all_pcm.len(),
        duration_secs,
        "meeting recording stopped, starting transcription"
    );

    // Transcribe the full audio
    match router.route_transcription(all_pcm, state.ws_session, &mut state.stt_event_rx).await {
        Ok((text, is_transcribed)) => {
            if is_transcribed {
                let text = persian::normalize_persian_text(&text);

                // Build SRT subtitle from the transcript (simple: one block)
                let srt = format_srt(&text, duration_secs);

                // Build full output with metadata
                let output = format!(
                    "# ترنسکریپت جلسه\n\n\
                     **مدت:** {:.1} ثانیه\n\
                     **تاریخ:** {}\n\n\
                     ---\n\n\
                     {}\n\n\
                     ---\n\n\
                     ## زیرنویس (SRT)\n\n```\n{}\n```",
                    duration_secs,
                    chrono_now_simple(),
                    text,
                    srt,
                );

                let _ = reply_tx.send(output);
                overlay::set_overlay_state(overlay::OverlayState::Success);
                tokio::spawn(async {
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    overlay::set_overlay_state(overlay::OverlayState::Hidden);
                });
            } else {
                let _ = reply_tx.send("ترنسکریپت ناموفق بود".to_string());
                overlay::set_overlay_state(overlay::OverlayState::Error);
                tokio::spawn(async {
                    tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                    overlay::set_overlay_state(overlay::OverlayState::Hidden);
                });
            }
            let _ = std::fs::remove_file(&enc_path);
        }
        Err(e) => {
            error!("meeting transcription failed: {}", e);
            let _ = reply_tx.send(format!("خطا در ترنسکریپت: {}", e));
            overlay::set_overlay_state(overlay::OverlayState::Error);
            tokio::spawn(async {
                tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                overlay::set_overlay_state(overlay::OverlayState::Hidden);
            });
            post_event(hwnd_raw);
            warn!("keeping encrypted temp file for recovery: {}", enc_path.display());
        }
    }
}

/// Format a simple SRT subtitle (one block covering the full duration)
fn format_srt(text: &str, duration_secs: f64) -> String {
    let start = "00:00:00,000";
    let end_secs = duration_secs.floor() as u64;
    let end_ms = ((duration_secs - end_secs as f64) * 1000.0) as u64;
    let end = format!(
        "{:02}:{:02}:{:02},{:03}",
        end_secs / 3600,
        (end_secs % 3600) / 60,
        end_secs % 60,
        end_ms
    );
    format!("1\n{} --> {}\n{}\n", start, end, text)
}

fn chrono_now_simple() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{:04}/{:02}/{:02} {:02}:{:02}",
        1400 + (now / 31536000) % 100,
        (now / 2592000) % 12 + 1,
        (now / 86400) % 30 + 1,
        (now / 3600) % 24,
        (now / 60) % 60,
    )
}

fn post_event(hwnd_raw: isize) {
    unsafe {
        let hwnd = windows::Win32::Foundation::HWND(hwnd_raw);
        let _ = PostMessageW(hwnd, tray::WM_DAEMON_EVENT, WPARAM(0), LPARAM(0));
    }
}
