use std::time::Instant;

use anyhow::{Context, Result};
use async_trait::async_trait;
use base64::Engine;

use super::{SttProvider, TranscriptionResult};
use crate::audio::AudioData;

pub struct GoogleSttProvider {
    api_key: String,
    client: reqwest::Client,
}

impl GoogleSttProvider {
    pub fn from_env() -> Option<Self> {
        let api_key = std::env::var("GOOGLE_API_KEY").ok()?;
        Some(Self {
            api_key,
            client: reqwest::Client::new(),
        })
    }
}

#[async_trait]
impl SttProvider for GoogleSttProvider {
    fn name(&self) -> &str {
        "google-stt"
    }

    fn cost_per_minute_usd(&self) -> f64 {
        0.024
    }

    async fn transcribe(&self, audio: &AudioData) -> Result<TranscriptionResult> {
        let wav_bytes = audio.to_wav_bytes();
        let encoded = base64::engine::general_purpose::STANDARD.encode(&wav_bytes);

        let body = serde_json::json!({
            "config": {
                "encoding": "LINEAR16",
                "sampleRateHertz": 16000,
                "languageCode": "fa-IR",
                "alternativeLanguageCodes": ["en-US"],
                "model": "latest_long",
                "enableAutomaticPunctuation": true,
            },
            "audio": {
                "content": encoded,
            }
        });

        let start = Instant::now();

        let resp = self
            .client
            .post(format!(
                "https://speech.googleapis.com/v1/speech:recognize?key={}",
                self.api_key
            ))
            .json(&body)
            .send()
            .await
            .context("sending request to Google STT")?;

        let latency = start.elapsed();

        let status = resp.status();
        let resp_body = resp.text().await.context("reading Google STT response")?;

        if !status.is_success() {
            anyhow::bail!("Google STT error {}: {}", status, resp_body);
        }

        let parsed: serde_json::Value =
            serde_json::from_str(&resp_body).context("parsing Google STT response")?;

        let text = parsed["results"]
            .as_array()
            .map(|results| {
                results
                    .iter()
                    .filter_map(|r| r["alternatives"][0]["transcript"].as_str())
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .unwrap_or_default()
            .trim()
            .to_string();

        Ok(TranscriptionResult { text, latency })
    }
}
