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
        let len = meta.len();
        let mut is_valid = len >= 10_000_000;
        if is_valid {
            use std::io::Read;
            if let Ok(mut f) = std::fs::File::open(&path) {
                let mut magic = [0u8; 4];
                if f.read_exact(&mut magic).is_ok() {
                    is_valid = magic == [0x6c, 0x6d, 0x67, 0x67]
                        || magic == [0x66, 0x6d, 0x67, 0x67]
                        || magic == [0x76, 0x6d, 0x67, 0x67]
                        || magic == *b"GGUF";
                } else {
                    is_valid = false;
                }
            } else {
                is_valid = false;
            }
        }
        Ok(serde_json::json!({
            "exists": true,
            "is_valid": is_valid,
            "size_bytes": len,
            "path": path.to_string_lossy(),
        }))
    } else {
        Ok(serde_json::json!({ "exists": false, "is_valid": false }))
    }
}

#[tauri::command]
async fn test_model_inference(model_id: String) -> Result<serde_json::Value, String> {
    let models_dir = resolve_models_dir();
    let model_path = models_dir.join(&model_id);
    if !model_path.exists() {
        return Err(format!("فایل مدل {} یافت نشد", model_id));
    }

    let local_bin = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("Zero")
        .join("bin")
        .join("whisper-cli.exe");

    let whisper_cli = if local_bin.exists() {
        local_bin
    } else {
        std::path::PathBuf::from("bin").join("whisper-cli.exe")
    };

    if !whisper_cli.exists() {
        return Err("ابزار whisper-cli.exe در سیستم یافت نشد".to_string());
    }

    let tmp_wav = std::env::temp_dir().join(format!(
        "zero_test_{}.wav",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    ));

    // Generate a 1-second 16kHz mono 16-bit PCM WAV acoustic wave
    let mut pcm_bytes = Vec::with_capacity(32000);
    for i in 0..16000 {
        let sample = (3000.0 * (2.0 * std::f32::consts::PI * 440.0 * (i as f32) / 16000.0).sin()) as i16;
        pcm_bytes.extend_from_slice(&sample.to_le_bytes());
    }

    let sample_rate: u32 = 16000;
    let channels: u16 = 1;
    let bits: u16 = 16;
    let byte_rate = sample_rate * (channels as u32) * ((bits as u32) / 8);
    let block_align = channels * (bits / 8);
    let mut wav_file_data = Vec::with_capacity(44 + pcm_bytes.len());
    wav_file_data.extend_from_slice(b"RIFF");
    wav_file_data.extend_from_slice(&(36 + pcm_bytes.len() as u32).to_le_bytes());
    wav_file_data.extend_from_slice(b"WAVEfmt ");
    wav_file_data.extend_from_slice(&16u32.to_le_bytes());
    wav_file_data.extend_from_slice(&1u16.to_le_bytes());
    wav_file_data.extend_from_slice(&channels.to_le_bytes());
    wav_file_data.extend_from_slice(&sample_rate.to_le_bytes());
    wav_file_data.extend_from_slice(&byte_rate.to_le_bytes());
    wav_file_data.extend_from_slice(&block_align.to_le_bytes());
    wav_file_data.extend_from_slice(&bits.to_le_bytes());
    wav_file_data.extend_from_slice(b"data");
    wav_file_data.extend_from_slice(&(pcm_bytes.len() as u32).to_le_bytes());
    wav_file_data.extend_from_slice(&pcm_bytes);

    let _ = std::fs::write(&tmp_wav, &wav_file_data);

    let start_time = std::time::Instant::now();
    let mut cmd = tokio::process::Command::new(&whisper_cli);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let num_threads = std::thread::available_parallelism()
        .map(|n| (n.get() / 2).max(4).min(8).to_string())
        .unwrap_or_else(|_| "6".to_string());

    let output_res = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        cmd.arg("-m")
            .arg(&model_path)
            .arg("-f")
            .arg(&tmp_wav)
            .arg("-nt")
            .arg("-np")
            .arg("-sns")
            .arg("-nf")
            .arg("-tp")
            .arg("0.0")
            .arg("-nth")
            .arg("0.65")
            .arg("-l")
            .arg("fa")
            .arg("-t")
            .arg(&num_threads)
            .output(),
    )
    .await;

    let duration_ms = start_time.elapsed().as_millis();
    let _ = std::fs::remove_file(&tmp_wav);

    match output_res {
        Ok(Ok(output)) => {
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

            Ok(serde_json::json!({
                "ok": true,
                "duration_ms": duration_ms,
                "output": text,
                "model_id": model_id,
            }))
        }
        Ok(Err(e)) => Err(format!("خطا در اجرای فرآیند مدل: {}", e)),
        Err(_) => Err("زمان اجرای تست مدل از ۳۰ ثانیه بیشتر شد (تایم‌اوت)".to_string()),
    }
}

#[tauri::command]
async fn test_llm_api(endpoint: String, api_key: String, model: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    let endpoint = endpoint.trim_end_matches('/').replace("localhost", "127.0.0.1");
    let url = if endpoint.ends_with("/chat/completions") {
        endpoint.to_string()
    } else {
        format!("{}/chat/completions", endpoint)
    };

    let mut req = client.post(&url);
    if !api_key.trim().is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key.trim()));
    }

    let payload = serde_json::json!({
        "model": model.trim(),
        "messages": [
            { "role": "user", "content": "Hi, just a ping." }
        ],
        "max_tokens": 5
    });

    let res = req.json(&payload).send().await.map_err(|e| format!("Network Error: {}", e))?;
    
    if res.status().is_success() {
        Ok("اتصال موفق بود!".to_string())
    } else {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        Err(format!("خطای API ({}): {}", status, err_text))
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
    let temp_dest = models_dir.join(format!("{}.part", model_id));

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(1200))
        .build()
        .map_err(|e| format!("failed to create HTTP client: {}", e))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("download request failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let code = status.as_u16();
        let msg = if code == 404 {
            "فایل مورد نظر در سرور یافت نشد (خطای ۴۰۴). لطفاً آدرس مدل یا اتصال را بررسی نمایید.".to_string()
        } else if code == 403 {
            "دسترسی به سرور دانلود محدود است (خطای ۴۰۳).".to_string()
        } else {
            format!("خطای سرور دانلود (کد {}). لطفاً اتصال اینترنت خود را بررسی نمایید.", code)
        };
        return Err(msg);
    }

    let total = resp.content_length().unwrap_or(0);
    let mut bytes_downloaded: u64 = 0;
    let file = std::fs::File::create(&temp_dest).map_err(|e| e.to_string())?;
    let mut stream = resp.bytes_stream();

    use tokio::io::AsyncWriteExt;
    let mut async_file = tokio::fs::File::from_std(file);

    while let Some(chunk_result) = stream.next().await {
        let chunk = match chunk_result {
            Ok(c) => c,
            Err(e) => {
                let _ = std::fs::remove_file(&temp_dest);
                return Err(format!("stream error: {}", e));
            }
        };
        if let Err(e) = async_file.write_all(&chunk).await {
            let _ = std::fs::remove_file(&temp_dest);
            return Err(format!("write error: {}", e));
        }
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

    if let Err(e) = async_file.flush().await {
        let _ = std::fs::remove_file(&temp_dest);
        return Err(format!("flush error: {}", e));
    }
    drop(async_file);

    if total > 0 && bytes_downloaded < total {
        let _ = std::fs::remove_file(&temp_dest);
        return Err(format!(
            "download truncated: received {} of {} bytes",
            bytes_downloaded, total
        ));
    }

    if dest.exists() {
        let _ = std::fs::remove_file(&dest);
    }
    std::fs::rename(&temp_dest, &dest)
        .map_err(|e| format!("failed to finalize downloaded file: {}", e))?;

    let _ = app.emit(
        "model-download-complete",
        serde_json::json!({ "model_id": &model_id }),
    );

    Ok(model_id)
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| format!("خطا در باز کردن لینک: {}", e))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("open").arg(&url).spawn();
    }
    Ok(())
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
        .resolve("scripts/auto_convert.py", tauri::path::BaseDirectory::Resource)
        .unwrap_or_else(|_| std::path::PathBuf::from("scripts/auto_convert.py"));
        
    let script_path_str = script_path.to_string_lossy().to_string();

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

fn check_right_panel_running() -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        if let Ok(out) = std::process::Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq right-panel.exe", "/NH"])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            return text.contains("right-panel.exe");
        }
    }
    false
}

fn ensure_right_panel_stopped() {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "right-panel.exe"])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();
    }
}

fn ensure_right_panel_started(app_handle: &tauri::AppHandle) -> bool {
    if check_right_panel_running() {
        return true;
    }

    use tauri_plugin_shell::ShellExt;
    if let Ok(sidecar) = app_handle.shell().sidecar("right-panel") {
        if let Ok(_) = sidecar.spawn() {
            return true;
        }
    }

    let mut candidates = Vec::new();

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join("right-panel.exe"));
            candidates.push(exe_dir.join("bin").join("right-panel.exe"));
            if let Some(parent) = exe_dir.parent() {
                candidates.push(parent.join("right-panel.exe"));
                candidates.push(parent.join("bin").join("right-panel.exe"));
                candidates.push(parent.join("target").join("release").join("right-panel.exe"));
                candidates.push(parent.join("Zero-Studio-Portable").join("right-panel.exe"));
            }
        }
    }

    if let Some(data_dir) = dirs::data_local_dir() {
        candidates.push(data_dir.join("Zero").join("bin").join("right-panel.exe"));
    }

    candidates.push(std::path::PathBuf::from("right-panel.exe"));
    candidates.push(std::path::PathBuf::from("bin").join("right-panel.exe"));
    candidates.push(std::path::PathBuf::from("target").join("release").join("right-panel.exe"));
    candidates.push(std::path::PathBuf::from("Zero-Studio-Portable").join("right-panel.exe"));

    for candidate in candidates {
        if candidate.is_file() {
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                let res = std::process::Command::new(candidate)
                    .creation_flags(0x08000000 | 0x00000008) // CREATE_NO_WINDOW | DETACHED_PROCESS
                    .spawn();
                if res.is_ok() {
                    return true;
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                if std::process::Command::new(candidate).spawn().is_ok() {
                    return true;
                }
            }
        }
    }

    false
}

#[tauri::command]
async fn is_right_panel_running() -> Result<bool, String> {
    Ok(check_right_panel_running())
}

#[tauri::command]
async fn start_right_panel(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(ensure_right_panel_started(&app))
}

#[tauri::command]
async fn stop_right_panel() -> Result<bool, String> {
    ensure_right_panel_stopped();
    Ok(true)
}

#[tauri::command]
async fn set_right_panel_enabled(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
    let cfg_res = send_ipc_request(serde_json::json!({ "type": "GetConfig" }), "Config").await;
    if let Ok(cfg_val) = cfg_res {
        if let Some(cfg_str) = cfg_val.get("config").and_then(|c| c.as_str()) {
            if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(cfg_str) {
                json["enable_right_panel"] = serde_json::Value::Bool(enabled);
                let _ = send_ipc_request(
                    serde_json::json!({ "type": "SetConfig", "config": json.to_string() }),
                    "Ack",
                ).await;
            }
        }
    }

    if enabled {
        ensure_right_panel_started(&app);
    } else {
        ensure_right_panel_stopped();
    }

    Ok(true)
}

fn main() {
    tauri::Builder::default()
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Tray Setup
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
            use tauri::Manager;
            
            let quit_i = MenuItem::with_id(app, "quit", "خروج", true, None::<&str>).unwrap();
            let menu = Menu::with_items(app, &[&quit_i]).unwrap();
            
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Zero Studio")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

fn ensure_daemon_started(app_handle: &tauri::AppHandle) {
    use tauri_plugin_shell::ShellExt;
    if let Ok(sidecar) = app_handle.shell().sidecar("zero-daemon") {
        if let Ok(_) = sidecar.spawn() {
            return;
        }
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            let candidates = [
                exe_dir.join("zero-daemon.exe"),
                exe_dir.join("zero-daemon-x86_64-pc-windows-msvc.exe"),
                exe_dir.join("bin").join("zero-daemon.exe"),
                exe_dir.join("bin").join("zero-daemon-x86_64-pc-windows-msvc.exe"),
                exe_dir.parent().map(|p| p.join("zero-daemon.exe")).unwrap_or_default(),
                exe_dir.parent().map(|p| p.join("target").join("release").join("zero-daemon.exe")).unwrap_or_default(),
            ];

            for candidate in &candidates {
                if candidate.is_file() {
                    #[cfg(target_os = "windows")]
                    {
                        use std::os::windows::process::CommandExt;
                        let _ = std::process::Command::new(candidate)
                            .creation_flags(0x08000000 | 0x00000008) // CREATE_NO_WINDOW | DETACHED_PROCESS
                            .spawn();
                        return;
                    }
                    #[cfg(not(target_os = "windows"))]
                    {
                        let _ = std::process::Command::new(candidate).spawn();
                        return;
                    }
                }
            }
        }
    }
}

// Daemon IPC
            let app_handle_for_daemon = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
                use tokio::net::windows::named_pipe::ClientOptions;
                
                let mut launch_attempts = 0;
                ensure_daemon_started(&app_handle_for_daemon);
                
                loop {
                    match ClientOptions::new().open(PIPE_NAME) {
                        Ok(mut pipe) => {
                            launch_attempts = 0;
                            let subscribe_msg = "{\"type\":\"Subscribe\"}\n";
                            let _ = pipe.write_all(subscribe_msg.as_bytes()).await;

                            let mut reader = BufReader::new(pipe);
                            let mut line = String::new();
                            while let Ok(n) = reader.read_line(&mut line).await {
                                if n == 0 { break; }
                                if let Ok(val) = serde_json::from_str::<serde_json::Value>(line.trim()) {
                                    if val.get("type").and_then(|t| t.as_str()) == Some("TranscriptionPreview") {
                                        if let (Some(text), Some(x), Some(y)) = (
                                            val.get("text").and_then(|t| t.as_str()),
                                            val.get("x").and_then(|x| x.as_i64()),
                                            val.get("y").and_then(|y| y.as_i64()),
                                        ) {
                                            if let Some(window) = app_handle_for_daemon.get_webview_window("preview") {
                                                let _ = window.center();
                                                let _ = window.show();
                                                let _ = window.set_focus();
                                            }
                                            let _ = app_handle_for_daemon.emit("interactive-preview", serde_json::json!({
                                                "text": text,
                                                "x": x,
                                                "y": y
                                            }));
                                        }
                                    } else if val.get("type").and_then(|t| t.as_str()) == Some("StartBrowserStt") {
                                        if let Some(window) = app_handle_for_daemon.get_webview_window("widget") {
                                            let _ = window.center();
                                            let _ = window.show();
                                            let _ = window.set_focus();
                                        }
                                        let _ = app_handle_for_daemon.emit("start-browser-stt", ());
                                    } else if val.get("type").and_then(|t| t.as_str()) == Some("StopBrowserStt") {
                                        if let Some(window) = app_handle_for_daemon.get_webview_window("widget") {
                                            let _ = window.hide();
                                        }
                                        let _ = app_handle_for_daemon.emit("stop-browser-stt", ());
                                    }
                                }
                                line.clear();
                            }
                        }
                        Err(e) => {
                            if e.kind() == std::io::ErrorKind::NotFound && launch_attempts < 5 {
                                launch_attempts += 1;
                                ensure_daemon_started(&app_handle_for_daemon);
                                tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
                                continue;
                            }
                        }
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }
            });

            // Auto-start TTS backend servers
            tauri::async_runtime::spawn(async move {
                let base_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .parent()
                    .unwrap()
                    .parent()
                    .unwrap()
                    .to_path_buf();
                
                let zero_server_dir = base_dir.join("zero-server");
                if zero_server_dir.exists() {
                    let python_dir = zero_server_dir.join("python-engines").join("tts");
                    
                    // Python TTS Engine
                    let mut python_cmd = tokio::process::Command::new("python");
                    python_cmd.current_dir(&python_dir);
                    python_cmd.arg("server.py");
                    #[cfg(target_os = "windows")]
                    python_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                    let _ = python_cmd.spawn();

                    // NestJS Server
                    let mut nest_cmd = tokio::process::Command::new(if cfg!(target_os = "windows") { "npm.cmd" } else { "npm" });
                    nest_cmd.current_dir(&zero_server_dir);
                    nest_cmd.arg("run").arg("start:dev");
                    #[cfg(target_os = "windows")]
                    nest_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                    let _ = nest_cmd.spawn();
                }
            });

            // Auto-start Right Panel if enabled in config
            let app_handle_for_right_panel = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
                let mut should_start = true;
                if let Ok(cfg_val) = send_ipc_request(serde_json::json!({ "type": "GetConfig" }), "Config").await {
                    if let Some(cfg_str) = cfg_val.get("config").and_then(|c| c.as_str()) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(cfg_str) {
                            if let Some(en) = json.get("enable_right_panel").and_then(|v| v.as_bool()) {
                                should_start = en;
                            }
                        }
                    }
                }
                if should_start {
                    ensure_right_panel_started(&app_handle_for_right_panel);
                }
            });

            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
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
            open_external_url,
            test_model,
            test_model_inference,
            test_llm_api,
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
            is_right_panel_running,
            start_right_panel,
            stop_right_panel,
            set_right_panel_enabled,
        ])
        .run(tauri::generate_context!())
        .expect("error running Zero Studio");
}
