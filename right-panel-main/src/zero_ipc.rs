use std::time::Duration;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::windows::named_pipe::ClientOptions;
use tao::event_loop::EventLoopProxy;
use crate::Ev;

const PIPE_NAME: &str = r"\\.\pipe\zero-ipc";

pub struct ZeroIpcClient;

impl ZeroIpcClient {
    pub fn start(proxy: EventLoopProxy<Ev>) {
        std::thread::spawn(move || {
            let rt = match tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            {
                Ok(r) => r,
                Err(_) => return,
            };

            rt.block_on(async move {
                let mut daemon_spawn_tried = false;
                loop {
                    match ClientOptions::new().open(PIPE_NAME) {
                        Ok(pipe) => {
                            let (reader, mut writer) = tokio::io::split(pipe);
                            
                            // Subscribe to realtime daemon events
                            let subscribe = "{\"type\":\"Subscribe\"}\n";
                            let _ = writer.write_all(subscribe.as_bytes()).await;

                            let _ = proxy.send_event(Ev::Script("if (window.app && app.daemonConnected) app.daemonConnected(true);".into()));

                            let mut lines = BufReader::new(reader).lines();
                            while let Ok(Some(line)) = lines.next_line().await {
                                if let Ok(val) = serde_json::from_str::<Value>(&line) {
                                    handle_incoming_event(&proxy, &val);
                                }
                            }

                            let _ = proxy.send_event(Ev::Script("if (window.app && app.daemonConnected) app.daemonConnected(false);".into()));
                        }
                        Err(_) => {
                            if !daemon_spawn_tried {
                                daemon_spawn_tried = true;
                                try_spawn_daemon();
                            }
                            tokio::time::sleep(Duration::from_secs(2)).await;
                        }
                    }
                }
            });
        });
    }

    pub fn send_request(req: Value) -> Result<Value, String> {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?;

        rt.block_on(async move {
            let client = ClientOptions::new()
                .open(PIPE_NAME)
                .map_err(|e| format!("IPC Open failed: {}", e))?;

            let (reader, mut writer) = tokio::io::split(client);
            let mut req_bytes = serde_json::to_vec(&req).map_err(|e| e.to_string())?;
            req_bytes.push(b'\n');

            writer.write_all(&req_bytes).await.map_err(|e| e.to_string())?;

            let mut reader = BufReader::new(reader);
            let mut line = String::new();
            
            let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
            tokio::time::timeout_at(deadline, reader.read_line(&mut line))
                .await
                .map_err(|_| "Timeout waiting for daemon reply".to_string())?
                .map_err(|e| e.to_string())?;

            serde_json::from_str::<Value>(line.trim()).map_err(|e| e.to_string())
        })
    }
}

fn handle_incoming_event(proxy: &EventLoopProxy<Ev>, val: &Value) {
    match val.get("type").and_then(|t| t.as_str()) {
        Some("TranscriptionPreview") => {
            if let Some(text) = val.get("text").and_then(|t| t.as_str()) {
                let script = format!("if (window.app && app.voicePreview) app.voicePreview({});", json!(text));
                let _ = proxy.send_event(Ev::Script(script));
            }
        }
        Some("StatusUpdate") => {
            if let Some(status) = val.get("status").and_then(|s| s.as_str()) {
                let script = format!("if (window.app && app.voiceStatus) app.voiceStatus({});", json!(status));
                let _ = proxy.send_event(Ev::Script(script));
            }
        }
        Some("Transcription") => {
            if let Some(text) = val.get("text").and_then(|t| t.as_str()) {
                let script = format!("if (window.app && app.voiceDone) app.voiceDone({});", json!(text));
                let _ = proxy.send_event(Ev::Script(script));
            }
        }
        Some("ToggleWidget") => {
            let script = "if (window.app && app.toggle) app.toggle();".to_string();
            let _ = proxy.send_event(Ev::Script(script));
        }
        _ => {}
    }
}

fn try_spawn_daemon() {
    let Ok(exe) = std::env::current_exe() else { return };
    let parent = match exe.parent() {
        Some(p) => p,
        None => return,
    };

    let candidates = [
        parent.join("zero-daemon.exe"),
        parent.join("bin").join("zero-daemon.exe"),
        parent.parent().unwrap_or(parent).join("zero-daemon.exe"),
        parent.parent().unwrap_or(parent).join("Zero-Studio-Portable").join("zero-daemon.exe"),
        parent.parent().unwrap_or(parent).join("target").join("release").join("zero-daemon.exe"),
    ];

    for path in &candidates {
        if path.is_file() {
            let mut cmd = std::process::Command::new(path);
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
            let _ = cmd.spawn();
            break;
        }
    }
}
