use std::time::Instant;

use anyhow::{Context, Result};
use async_trait::async_trait;

use super::{SttProvider, TranscriptionResult};
use crate::audio::AudioData;

pub struct AzureSttProvider {
    key: String,
    region: String,
    client: reqwest::Client,
}

impl AzureSttProvider {
    pub fn from_env() -> Option<Self> {
        let key = std::env::var("AZURE_STT_KEY").ok()?;
        let region = std::env::var("AZURE_STT_REGION").ok()?;
        Some(Self {
            key,
            region,
            client: reqwest::Client::new(),
        })
    }
}

#[async_trait]
impl SttProvider for AzureSttProvider {
    fn name(&self) -> &str {
        "azure-stt"
    }

    fn cost_per_minute_usd(&self) -> f64 {
        0.01
    }

    async fn transcribe(&self, audio: &AudioData) -> Result<TranscriptionResult> {
        let wav_bytes = audio.to_wav_bytes();

        let url = format!(
            "https://{}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1\
             ?language=fa-IR&format=detailed",
            self.region
        );

        let start = Instant::now();

        let resp = self
            .client
            .post(&url)
            .header("Ocp-Apim-Subscription-Key", &self.key)
            .header("Content-Type", "audio/wav; codecs=audio/pcm; samplerate=16000")
            .body(wav_bytes)
            .send()
            .await
            .context("sending request to Azure STT")?;

        let latency = start.elapsed();

        let status = resp.status();
        let body = resp.text().await.context("reading Azure STT response")?;

        if !status.is_success() {
            anyhow::bail!("Azure STT error {}: {}", status, body);
        }

        let parsed: serde_json::Value =
            serde_json::from_str(&body).context("parsing Azure STT response")?;

        let text = parsed["DisplayText"]
            .as_str()
            .or_else(|| parsed["NBest"][0]["Display"].as_str())
            .unwrap_or("")
            .trim()
            .to_string();

        Ok(TranscriptionResult { text, latency })
    }
}
