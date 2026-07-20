#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::windows::named_pipe::ClientOptions;


/// Sends one request over the daemon's named pipe and returns the reply.
/// Protocol: newline-delimited JSON; every request gets exactly one reply line
/// (this connection never subscribes to broadcasts, so the first line whose
/// `type` matches `expected` — or `ErrorMsg` — is the reply).
async fn send_ipc_request(
    req: serde_json::Value,
    expected: &str,
) -> Result<serde_json::Value, String> {
    send_ipc_request_with_timeout(req, expected, std::time::Duration::from_secs(3)).await
}

async fn send_ipc_request_with_timeout(
    req: serde_json::Value,
    expected: &str,
    timeout: std::time::Duration,
) -> Result<serde_json::Value, String> {
    let pipe_name = r"\\.\pipe\zero-ipc";

    let client = ClientOptions::new()
        .open(pipe_name)
        .map_err(|e| format!("Failed to connect to daemon pipe: {}", e))?;

    let (reader, mut writer) = tokio::io::split(client);

    let mut req_bytes =
        serde_json::to_vec(&req).map_err(|e| format!("Serialization error: {}", e))?;
    req_bytes.push(b'\n');

    writer
        .write_all(&req_bytes)
        .await
        .map_err(|e| format!("Write error: {}", e))?;

    let mut reader = BufReader::new(reader);
    let deadline = tokio::time::Instant::now() + timeout;
    let mut line = String::new();

    loop {
        line.clear();
        let n = tokio::time::timeout_at(deadline, reader.read_line(&mut line))
            .await
            .map_err(|_| "Timed out waiting for daemon reply".to_string())?
            .map_err(|e| format!("Read error: {}", e))?;

        if n == 0 {
            return Err("Daemon closed the pipe before replying".to_string());
        }

        let msg: serde_json::Value = match serde_json::from_str(line.trim()) {
            Ok(v) => v,
            Err(_) => continue,
        };

        match msg.get("type").and_then(|t| t.as_str()) {
            Some(t) if t == expected => return Ok(msg),
            Some("ErrorMsg") => {
                let detail = msg
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("unknown daemon error");
                return Err(detail.to_string());
            }
            _ => continue,
        }
    }
}

#[tauri::command]
async fn get_daemon_status() -> Result<serde_json::Value, String> {
    send_ipc_request(serde_json::json!({ "type": "GetStatus" }), "StatusUpdate").await
}

#[tauri::command]
async fn trigger_record() -> Result<serde_json::Value, String> {
    send_ipc_request(serde_json::json!({ "type": "TriggerRecord" }), "Ack").await
}

#[tauri::command]
async fn update_settings(settings: String) -> Result<serde_json::Value, String> {
    send_ipc_request(
        serde_json::json!({ "type": "UpdateSettings", "settings": settings }),
        "Ack",
    )
    .await
}

#[tauri::command]
async fn record_for_notepad() -> Result<String, String> {
    let result = send_ipc_request_with_timeout(
        serde_json::json!({ "type": "RecordForNotepad" }),
        "TranscriptionResult",
        std::time::Duration::from_secs(65),
    )
    .await?;
    Ok(result["text"].as_str().unwrap_or("").to_string())
}

#[tauri::command]
async fn get_model_status() -> Result<serde_json::Value, String> {
    send_ipc_request(
        serde_json::json!({ "type": "GetModelStatus" }),
        "ModelStatus",
    )
    .await
}

#[tauri::command]
async fn set_active_model(model_id: String) -> Result<serde_json::Value, String> {
    send_ipc_request(
        serde_json::json!({ "type": "SetActiveModel", "model_id": model_id }),
        "Ack",
    )
    .await
}

#[tauri::command]
async fn get_config() -> Result<serde_json::Value, String> {
    send_ipc_request(serde_json::json!({ "type": "GetConfig" }), "Config").await
}

#[tauri::command]
async fn set_config(config: String) -> Result<serde_json::Value, String> {
    send_ipc_request(
        serde_json::json!({ "type": "SetConfig", "config": config }),
        "Ack",
    )
    .await
}

/// Resolves the models directory: reads config.json directly, falls back to default
fn resolve_models_dir() -> std::path::PathBuf {
    // Read config.json directly (faster, no IPC dependency)
    let config_path = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("Zero")
        .join("config.json");

    if let Ok(content) = std::fs::read_to_string(&config_path) {
        if let Ok(cfg) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(dir) = cfg.get("models_dir").and_then(|d| d.as_str()) {
                if !dir.is_empty() {
                    let path = std::path::PathBuf::from(dir);
                    // Verify the path exists, otherwise fall back
                    if path.exists() {
                        return path;
                    }
                }
            }
        }
    }

    // Default: %LOCALAPPDATA%\Zero\models
    dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("Zero")
        .join("models")
}

#[tauri::command]
async fn delete_model(model_id: String) -> Result<String, String> {
    let models_dir = resolve_models_dir();
    let path = models_dir.join(&model_id);
    std::fs::remove_file(&path).map_err(|e| format!("failed to delete model: {}", e))?;
    Ok(model_id)
}

#[tauri::command]
async fn get_models_dir() -> Result<String, String> {
    let models_dir = resolve_models_dir();
    std::fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;
    Ok(models_dir.to_string_lossy().to_string())
}

#[tauri::command]
async fn check_stt_status() -> Result<serde_json::Value, String> {
    let models_dir = resolve_models_dir();
    let config_res = send_ipc_request(serde_json::json!({ "type": "GetConfig" }), "Config").await;

    let (openai_key, active_model) = match config_res {
        Ok(val) => {
            let cfg_str = val.get("config").and_then(|c| c.as_str()).unwrap_or("{}");
            let cfg: serde_json::Value = serde_json::from_str(cfg_str).unwrap_or(serde_json::json!({}));
            let key = cfg.get("openai_api_key").and_then(|k| k.as_str()).unwrap_or("").to_string();
            let model = cfg.get("active_model").and_then(|m| m.as_str()).unwrap_or("ggml-base.bin").to_string();
            (key, model)
        }
        Err(_) => (String::new(), "ggml-base.bin".to_string()),
    };

    let has_openai = !openai_key.is_empty() && !openai_key.starts_with("mock");
    let model_path = models_dir.join(&active_model);
    let has_local = model_path.exists();

    Ok(serde_json::json!({
        "cloud_available": has_openai,
        "local_available": has_local,
        "active_model": active_model,
        "models_dir": models_dir.to_string_lossy(),
    }))
}

#[tauri::command]
async fn test_model(model_id: String) -> Result<serde_json::Value, String> {
    let models_dir = resolve_models_dir();
    let path = models_dir.join(&model_id);
    if path.exists() {
        let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        Ok(serde_json::json!({
            "exists": true,
            "size_bytes": meta.len(),
            "path": path.to_string_lossy(),
        }))
    } else {
        Ok(serde_json::json!({ "exists": false }))
    }
}

#[tauri::command]
async fn set_models_dir(dir: String) -> Result<serde_json::Value, String> {
    // Read current config, update models_dir, save back
    let res = send_ipc_request(serde_json::json!({ "type": "GetConfig" }), "Config").await;
    let mut cfg = match res {
        Ok(val) => {
            let cfg_str = val.get("config").and_then(|c| c.as_str()).unwrap_or("{}");
            serde_json::from_str::<serde_json::Value>(cfg_str).unwrap_or(serde_json::json!({}))
        }
        Err(_) => serde_json::json!({}),
    };
    cfg["models_dir"] = serde_json::Value::String(dir);
    send_ipc_request(
        serde_json::json!({ "type": "SetConfig", "config": cfg.to_string() }),
        "Ack",
    )
    .await
}

// ========== Faster-Whisper Server Management ==========

#[tauri::command]
async fn check_faster_whisper() -> Result<serde_json::Value, String> {
    // Check if Python is available
    let python_ok = tokio::process::Command::new("python")
        .arg("--version")
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false);

    // Check if faster-whisper is installed
    let fw_ok = if python_ok {
        tokio::process::Command::new("python")
            .args(["-c", "import faster_whisper; print('ok')"])
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false)
    } else {
        false
    };

    // Check if server is running (port 8787)
    let server_running = match reqwest::get("http://127.0.0.1:8787/health").await {
        Ok(r) => r.status().is_success(),
        Err(_) => false,
    };

    // Get current STT mode from config
    let stt_mode = {
        let config_path = dirs::data_local_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("Zero")
            .join("config.json");
        std::fs::read_to_string(&config_path)
            .ok()
            .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
            .and_then(|v| v.get("stt_mode").and_then(|m| m.as_str()).map(String::from))
            .unwrap_or_else(|| "browser".to_string())
    };

    Ok(serde_json::json!({
        "python_available": python_ok,
        "faster_whisper_installed": fw_ok,
        "server_running": server_running,
        "stt_mode": stt_mode,
    }))
}

#[tauri::command]
async fn install_faster_whisper() -> Result<String, String> {
    let server_dir = std::env::temp_dir().join("zero-faster-whisper");
    std::fs::create_dir_all(&server_dir).map_err(|e| e.to_string())?;

    // Copy requirements.txt to temp dir
    let req_path = server_dir.join("requirements.txt");
    std::fs::write(&req_path, "faster-whisper>=1.0.0\nfastapi>=0.100.0\nuvicorn>=0.23.0\npython-multipart>=0.0.6\n")
        .map_err(|e| e.to_string())?;

    // Run pip install
    let output = tokio::process::Command::new("python")
        .args(["-m", "pip", "install", "-r", &req_path.to_string_lossy()])
        .output()
        .await
        .map_err(|e| format!("failed to run pip: {}", e))?;

    if output.status.success() {
        Ok("Faster-Whisper با موفقیت نصب شد".to_string())
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        Err(format!("pip install failed: {}", err))
    }
}

#[tauri::command]
async fn start_faster_whisper() -> Result<String, String> {
    // Check if already running
    let health = reqwest::get("http://127.0.0.1:8787/health").await;
    if health.is_ok() {
        return Ok("server already running".to_string());
    }

    // Find the server script
    let script_path = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("tools")
        .join("faster-whisper-server")
        .join("server.py");

    if !script_path.exists() {
        // Try alternative path (when running from src-tauri)
        let alt = std::path::PathBuf::from("D:\\zero-project\\tools\\faster-whisper-server\\server.py");
        if alt.exists() {
            return start_fw_server(&alt).await;
        }
        return Err("server.py not found".to_string());
    }

    start_fw_server(&script_path).await
}

async fn start_fw_server(script_path: &std::path::Path) -> Result<String, String> {
    let _ = tokio::process::Command::new("python")
        .arg(script_path)
        .arg("8787")
        .spawn()
        .map_err(|e| format!("failed to start server: {}", e))?;

    // Wait a bit for server to start
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    // Verify it's running
    match reqwest::get("http://127.0.0.1:8787/health").await {
        Ok(_) => Ok("Faster-Whisper server started on port 8787".to_string()),
        Err(e) => Err(format!("server started but health check failed: {}", e)),
    }
}

#[tauri::command]
async fn stop_faster_whisper() -> Result<String, String> {
    // Find and kill python process running server.py
    #[cfg(target_os = "windows")]
    {
        let _ = tokio::process::Command::new("taskkill")
            .args(["/F", "/IM", "python.exe", "/FI", "WINDOWTITLE eq *server*"])
            .output()
            .await;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = tokio::process::Command::new("pkill")
            .arg("-f", "server.py")
            .output()
            .await;
    }
    Ok("Faster-Whisper server stopped".to_string())
}

#[tauri::command]
async fn set_stt_mode(mode: String) -> Result<serde_json::Value, String> {
    let config_path = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("Zero")
        .join("config.json");

    let mut cfg: serde_json::Value = if let Ok(content) = std::fs::read_to_string(&config_path) {
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    cfg["stt_mode"] = serde_json::Value::String(mode);

    std::fs::write(&config_path, serde_json::to_string_pretty(&cfg).unwrap())
        .map_err(|e| e.to_string())?;

    // Also update daemon config via IPC
    let _ = send_ipc_request(
        serde_json::json!({ "type": "SetConfig", "config": cfg.to_string() }),
        "Ack",
    ).await;

    Ok(serde_json::json!({ "ok": true, "mode": cfg["stt_mode"] }))
}

#[tauri::command]
async fn download_model(
    app: tauri::AppHandle,
    model_id: String,
    url: String,
) -> Result<String, String> {
    use futures_util::StreamExt;
    use tauri::Emitter;

    let models_dir = resolve_models_dir();
    std::fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;
    let dest = models_dir.join(&model_id);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| format!("failed to create HTTP client: {}", e))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("download request failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP error: {}", status.as_u16()));
    }

    let total = resp.content_length().unwrap_or(0);
    let mut bytes_downloaded: u64 = 0;
    let file = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
    let mut stream = resp.bytes_stream();

    use tokio::io::AsyncWriteExt;
    let mut async_file = tokio::fs::File::from_std(file);

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("stream error: {}", e))?;
        async_file.write_all(&chunk).await.map_err(|e| format!("write error: {}", e))?;
        bytes_downloaded += chunk.len() as u64;

        let _ = app.emit(
            "model-download-progress",
            serde_json::json!({
                "model_id": &model_id,
                "downloaded": bytes_downloaded,
                "total": total,
            }),
        );
    }

    async_file.flush().await.map_err(|e| format!("flush error: {}", e))?;

    let _ = app.emit(
        "model-download-complete",
        serde_json::json!({ "model_id": &model_id }),
    );

    Ok(model_id)
}

#[tauri::command]
async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|f| f.to_string()))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_daemon_status,
            trigger_record,
            update_settings,
            record_for_notepad,
            get_model_status,
            set_active_model,
            get_config,
            set_config,
            delete_model,
            get_models_dir,
            set_models_dir,
            test_model,
            check_stt_status,
            download_model,
            pick_folder,
            check_faster_whisper,
            install_faster_whisper,
            start_faster_whisper,
            stop_faster_whisper,
            set_stt_mode,
        ])
        .run(tauri::generate_context!())
        .expect("error running Zero Studio");
}
