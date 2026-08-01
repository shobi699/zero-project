#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::windows::named_pipe::ClientOptions;
use tauri::Emitter;

const PIPE_NAME: &str = r"\\.\pipe\zero-ipc";

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
    let client = ClientOptions::new()
        .open(PIPE_NAME)
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
async fn inject_text(text: String) -> Result<serde_json::Value, String> {
    send_ipc_request(
        serde_json::json!({ "type": "InjectText", "text": text }),
        "Ack"
    ).await
}

#[tauri::command]
async fn cancel_preview() -> Result<serde_json::Value, String> {
    send_ipc_request(
        serde_json::json!({ "type": "CancelPreview" }),
        "Ack"
    ).await
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

#[tauri::command]
async fn get_history() -> Result<serde_json::Value, String> {
    send_ipc_request(serde_json::json!({ "type": "GetHistory" }), "History").await
}

#[tauri::command]
async fn delete_history(id: String) -> Result<serde_json::Value, String> {
    send_ipc_request(
        serde_json::json!({ "type": "DeleteHistory", "id": id }),
        "Ack",
    )
    .await
}

#[tauri::command]
async fn delete_all_history() -> Result<serde_json::Value, String> {
    send_ipc_request(serde_json::json!({ "type": "DeleteAllHistory" }), "Ack").await
}

#[tauri::command]
async fn get_blacklist() -> Result<serde_json::Value, String> {
    send_ipc_request(serde_json::json!({ "type": "GetBlacklist" }), "Blacklist").await
}

#[tauri::command]
async fn add_blacklist(process: String) -> Result<serde_json::Value, String> {
    send_ipc_request(
        serde_json::json!({ "type": "AddBlacklist", "process": process }),
        "Ack",
    )
    .await
}

#[tauri::command]
async fn remove_blacklist(process: String) -> Result<serde_json::Value, String> {
    send_ipc_request(
        serde_json::json!({ "type": "RemoveBlacklist", "process": process }),
        "Ack",
    )
    .await
}

#[tauri::command]
async fn delete_all_data() -> Result<serde_json::Value, String> {
    send_ipc_request(serde_json::json!({ "type": "DeleteAllData" }), "Ack").await
}

#[tauri::command]
async fn get_notes() -> Result<serde_json::Value, String> {
    send_ipc_request(serde_json::json!({ "type": "GetNotes" }), "Notes").await
}

#[tauri::command]
async fn get_note(id: String) -> Result<serde_json::Value, String> {
    send_ipc_request(serde_json::json!({ "type": "GetNote", "id": id }), "Note").await
}

#[tauri::command]
async fn create_note(title: String, body: String, tags: String) -> Result<serde_json::Value, String> {
    send_ipc_request(
        serde_json::json!({ "type": "CreateNote", "title": title, "body": body, "tags": tags }),
        "Note",
    )
    .await
}

#[tauri::command]
async fn update_note(id: String, title: String, body: String, tags: String) -> Result<serde_json::Value, String> {
    send_ipc_request(
        serde_json::json!({ "type": "UpdateNote", "id": id, "title": title, "body": body, "tags": tags }),
        "Ack",
    )
    .await
}

#[tauri::command]
async fn pin_note(id: String, pinned: bool) -> Result<serde_json::Value, String> {
    send_ipc_request(
        serde_json::json!({ "type": "PinNote", "id": id, "pinned": pinned }),
        "Ack",
    )
    .await
}

#[tauri::command]
async fn delete_note(id: String) -> Result<serde_json::Value, String> {
    send_ipc_request(serde_json::json!({ "type": "DeleteNote", "id": id }), "Ack").await
}

#[tauri::command]
async fn search_notes(query: String) -> Result<serde_json::Value, String> {
    send_ipc_request(serde_json::json!({ "type": "SearchNotes", "query": query }), "Notes").await
}

#[tauri::command]
async fn start_meeting() -> Result<serde_json::Value, String> {
    send_ipc_request(serde_json::json!({ "type": "StartMeeting" }), "Ack").await
}

#[tauri::command]
async fn stop_meeting() -> Result<String, String> {
    let result = send_ipc_request_with_timeout(
        serde_json::json!({ "type": "StopMeeting" }),
        "TranscriptionResult",
        std::time::Duration::from_secs(125),
    )
    .await?;
    Ok(result["text"].as_str().unwrap_or("").to_string())
}

#[tauri::command]
async fn get_dictionary() -> Result<serde_json::Value, String> {
    send_ipc_request(serde_json::json!({ "type": "GetDictionary" }), "Dictionary").await
}

#[tauri::command]
async fn add_dictionary(wrong: String, correct: String) -> Result<serde_json::Value, String> {
    send_ipc_request(
        serde_json::json!({ "type": "AddDictionary", "wrong": wrong, "correct": correct }),
        "Ack",
    )
    .await
}

#[tauri::command]
async fn remove_dictionary(id: i64) -> Result<serde_json::Value, String> {
    send_ipc_request(serde_json::json!({ "type": "RemoveDictionary", "id": id }), "Ack").await
}

#[tauri::command]
async fn get_snippets() -> Result<serde_json::Value, String> {
    send_ipc_request(serde_json::json!({ "type": "GetSnippets" }), "Snippets").await
}

#[tauri::command]
async fn add_snippet(trigger_text: String, replacement: String) -> Result<serde_json::Value, String> {
    send_ipc_request(
        serde_json::json!({ "type": "AddSnippet", "trigger_text": trigger_text, "replacement": replacement }),
        "Ack",
    )
    .await
}

#[tauri::command]
async fn remove_snippet(id: i64) -> Result<serde_json::Value, String> {
    send_ipc_request(serde_json::json!({ "type": "RemoveSnippet", "id": id }), "Ack").await
}

#[tauri::command]
async fn get_usage_stats() -> Result<serde_json::Value, String> {
    send_ipc_request(serde_json::json!({ "type": "GetUsageStats" }), "UsageStats").await
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
fn open_models_dir() -> Result<(), String> {
    let models_dir = resolve_models_dir();
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&models_dir)
            .spawn()
            .map_err(|e| format!("خطا در باز کردن پوشه: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&models_dir)
            .spawn()
            .map_err(|e| format!("خطا در باز کردن پوشه: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&models_dir)
            .spawn()
            .map_err(|e| format!("خطا در باز کردن پوشه: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn auto_convert_hf_model(
    app: tauri::AppHandle,
    repo_id: String,
    filename: String,
) -> Result<String, String> {
    use tauri::Emitter;
    use tauri::Manager;
    use tokio::io::AsyncBufReadExt;

    let models_dir = resolve_models_dir();
    let cache_dir = models_dir.join(format!("{}_cache", filename));
    let output_file = models_dir.join(&filename);

    let script_path = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("scripts")
        .join("auto_convert.py");
        
    // fallback if not found in appData (for dev)
    let script_path_str = if script_path.exists() {
        script_path.to_string_lossy().to_string()
    } else {
        "scripts/auto_convert.py".to_string()
    };

    let mut cmd = tokio::process::Command::new("python");
    cmd.arg(script_path_str)
        .arg(&repo_id)
        .arg(output_file.to_string_lossy().to_string())
        .arg(cache_dir.to_string_lossy().to_string());

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    
    // Hide console window on Windows
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn().map_err(|e| format!("خطا در اجرای پایتون: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    
    let mut reader = tokio::io::BufReader::new(stdout).lines();
    let mut err_reader = tokio::io::BufReader::new(stderr).lines();

    let app_clone = app.clone();
    let filename_clone = filename.clone();
    tokio::spawn(async move {
        while let Ok(Some(line)) = err_reader.next_line().await {
            let _ = app_clone.emit("model-convert-progress", serde_json::json!({
                "model_id": filename_clone,
                "message": line
            }));
        }
    });

    while let Ok(Some(line)) = reader.next_line().await {
        let _ = app.emit("model-convert-progress", serde_json::json!({
            "model_id": filename,
            "message": line
        }));
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;

    if !status.success() {
        return Err("عملیات تبدیل با خطا مواجه شد. لطفاً لاگ‌ها را بررسی کنید.".to_string());
    }

    let _ = app.emit("model-download-complete", serde_json::json!({ "model_id": filename }));

    Ok(filename)
}

#[tauri::command]
async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|f| f.to_string()))
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tokio::io::{AsyncBufReadExt, BufReader};
                use tokio::net::windows::named_pipe::ClientOptions;
                loop {
                    match ClientOptions::new().open(PIPE_NAME) {
                        Ok(pipe) => {
                            let mut reader = BufReader::new(pipe);
                            let mut line = String::new();
                            while let Ok(n) = reader.read_line(&mut line).await {
                                if n == 0 { break; }
                                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                                    if let Some(msg_type) = val.get("TranscriptionPreview") {
                                        if let (Some(text), Some(x), Some(y)) = (
                                            msg_type.get("text").and_then(|t| t.as_str()),
                                            msg_type.get("x").and_then(|x| x.as_i64()),
                                            msg_type.get("y").and_then(|y| y.as_i64()),
                                        ) {
                                            let _ = app_handle.emit("interactive-preview", serde_json::json!({
                                                "text": text,
                                                "x": x,
                                                "y": y
                                            }));
                                        }
                                    }
                                }
                                line.clear();
                            }
                        }
                        Err(_) => {}
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }
            });
            Ok(())
        })
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
            open_models_dir,
            test_model,
            check_stt_status,
            download_model,
            auto_convert_hf_model,
            pick_folder,
            check_faster_whisper,
            install_faster_whisper,
            start_faster_whisper,
            stop_faster_whisper,
            set_stt_mode,
            get_history,
            delete_history,
            delete_all_history,
            get_blacklist,
            add_blacklist,
            remove_blacklist,
            delete_all_data,
            get_notes,
            get_note,
            create_note,
            update_note,
            pin_note,
            delete_note,
            search_notes,
            start_meeting,
            stop_meeting,
            get_dictionary,
            add_dictionary,
            remove_dictionary,
            get_snippets,
            add_snippet,
            remove_snippet,
            get_usage_stats,
            inject_text,
            cancel_preview,
        ])
        .run(tauri::generate_context!())
        .expect("error running Zero Studio");
}
