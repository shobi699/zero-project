pub mod azure;
pub mod dummy;
pub mod google;
pub mod whisper_api;

use std::time::Duration;

use anyhow::Result;
use async_trait::async_trait;

use crate::audio::AudioData;

pub struct TranscriptionResult {
    pub text: String,
    pub latency: Duration,
}

#[async_trait]
pub trait SttProvider: Send + Sync {
    fn name(&self) -> &str;
    fn cost_per_minute_usd(&self) -> f64;
    async fn transcribe(&self, audio: &AudioData) -> Result<TranscriptionResult>;
}

pub fn create_providers(include_dummy: bool) -> Vec<Box<dyn SttProvider>> {
    let mut providers: Vec<Box<dyn SttProvider>> = Vec::new();

    if let Some(p) = whisper_api::WhisperApiProvider::from_env() {
        providers.push(Box::new(p));
    }

    if let Some(p) = google::GoogleSttProvider::from_env() {
        providers.push(Box::new(p));
    }

    if let Some(p) = azure::AzureSttProvider::from_env() {
        providers.push(Box::new(p));
    }

    if include_dummy || providers.is_empty() {
        providers.push(Box::new(dummy::DummyProvider));
    }

    providers
}
