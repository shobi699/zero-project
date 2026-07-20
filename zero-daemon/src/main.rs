#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod buffer;
mod clipboard;
mod config;
mod crypto;
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

const GATEWAY_URL: &str = "ws://127.0.0.1:9009";

#[allow(dead_code)]
enum DaemonCmd {
    StartRecording,
    StopRecording,
    ToggleRecording,
    /// Record for the notepad — transcribed text is returned via the Sender
    /// instead of being injected at the OS cursor.
    RecordForNotepad(ipc::NotepadReplyTx),
    Shutdown,
}

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
    info!("hotkey registered: Ctrl+Shift+Z (low-level hook)");

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

    let writer = tokio::spawn(async move {
        let mut all_pcm = Vec::new();
        while let Some(chunk) = audio_rx.recv().await {
            if let Err(e) = temp_buffer.write_chunk(&chunk) {
                warn!("failed to write audio chunk to temp buffer: {}", e);
            }
            all_pcm.extend_from_slice(&chunk);
        }
        (temp_buffer, all_pcm)
    });

    let (stt_tx, stt_event_rx) = mpsc::unbounded_channel();
    let ws_session = match ws_client::SttSession::connect(GATEWAY_URL, stt_tx).await {
        Ok(s) => Some(s),
        Err(e) => {
            warn!("gateway not available: {} — recording locally only", e);
            None
        }
    };

    let _ = event_tx.send(DaemonEvent::RecordingStarted);
    post_event(hwnd_raw);

    Ok(RecordingState {
        capture,
        writer,
        ws_session,
        stt_event_rx,
        snapshot,
        notepad_reply,
    })
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
                let text = persian::normalize_persian_text(&text);
                overlay::set_overlay_state(overlay::OverlayState::Success);
                tokio::spawn(async {
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    overlay::set_overlay_state(overlay::OverlayState::Hidden);
                });

                if let Some(reply_tx) = state.notepad_reply {
                    // Notepad mode: return text to Studio, skip injection.
                    let _ = reply_tx.send(text.clone());
                    info!(text = %text, "text returned to notepad (no injection)");
                } else {
                    // Normal mode: inject text at OS cursor.
                    let injector = TextInjector::new(std::sync::Arc::new(injector::Win32LowLevelInjector));
                    let strategy = injector.inject(&text, &state.snapshot).await;

                    let _ = event_tx.send(DaemonEvent::TranscriptionDone(text.clone(), strategy));
                    if let Some(server) = crate::ipc::get_ipc_server() {
                        server.broadcast_transcription(text, format!("{:?}", strategy));
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

fn post_event(hwnd_raw: isize) {
    unsafe {
        let hwnd = windows::Win32::Foundation::HWND(hwnd_raw);
        let _ = PostMessageW(hwnd, tray::WM_DAEMON_EVENT, WPARAM(0), LPARAM(0));
    }
}
