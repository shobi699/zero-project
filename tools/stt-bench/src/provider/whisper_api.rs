use std::time::Instant;

use anyhow::{Context, Result};
use async_trait::async_trait;
use reqwest::multipart;

use super::{SttProvider, TranscriptionResult};
use crate::audio::AudioData;

pub struct WhisperApiProvider {
    api_key: String,
    client: reqwest::Client,
}

impl WhisperApiProvider {
    pub fn from_env() -> Option<Self> {
        let api_key = std::env::var("OPENAI_API_KEY").ok()?;
        Some(Self {
            api_key,
            client: reqwest::Client::new(),
        })
    }
}

#[async_trait]
impl SttProvider for WhisperApiProvider {
    fn name(&self) -> &str {
        "whisper-api"
    }

    fn cost_per_minute_usd(&self) -> f64 {
        0.006
    }

    async fn transcribe(&self, audio: &AudioData) -> Result<TranscriptionResult> {
        let wav_bytes = audio.to_wav_bytes();

        let file_part = multipart::Part::bytes(wav_bytes)
            .file_name("audio.wav")
            .mime_str("audio/wav")?;

        let form = multipart::Form::new()
            .text("model", "whisper-1")
            .text("language", "fa")
            .text("response_format", "json")
            .part("file", file_part);

        let start = Instant::now();

        let resp = self
            .client
            .post("https://api.openai.com/v1/audio/transcriptions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .multipart(form)
            .send()
            .await
            .context("sending request to Whisper API")?;

        let latency = start.elapsed();

        let status = resp.status();
        let body = resp.text().await.context("reading Whisper API response")?;

        if !status.is_success() {
            anyhow::bail!("Whisper API error {}: {}", status, body);
        }

        let parsed: serde_json::Value =
            serde_json::from_str(&body).context("parsing Whisper API response")?;

        let text = parsed["text"]
            .as_str()
            .unwrap_or("")
            .trim()
            .to_string();

        Ok(TranscriptionResult { text, latency })
    }
}
