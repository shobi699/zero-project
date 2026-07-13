use std::time::Instant;

use anyhow::Result;
use async_trait::async_trait;

use super::{SttProvider, TranscriptionResult};
use crate::audio::AudioData;

/// Returns empty text — useful for verifying the harness pipeline without API keys.
pub struct DummyProvider;

#[async_trait]
impl SttProvider for DummyProvider {
    fn name(&self) -> &str {
        "dummy"
    }

    fn cost_per_minute_usd(&self) -> f64 {
        0.0
    }

    async fn transcribe(&self, _audio: &AudioData) -> Result<TranscriptionResult> {
        let start = Instant::now();
        Ok(TranscriptionResult {
            text: String::new(),
            latency: start.elapsed(),
        })
    }
}
