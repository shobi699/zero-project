use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use tokio::sync::mpsc;
use tracing::{error, info};

pub struct CaptureHandle {
    _stream: cpal::Stream,
    stop_flag: Arc<AtomicBool>,
}

impl CaptureHandle {
    pub fn stop(self) {
        self.stop_flag.store(true, Ordering::Relaxed);
    }
}

pub fn start_capture(chunk_tx: mpsc::UnboundedSender<Vec<u8>>) -> Result<CaptureHandle> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .context("no audio input device found")?;

    info!(device = ?device.name(), "using input device");

    let supported = device
        .default_input_config()
        .context("no supported input config")?;

    let source_rate = supported.sample_rate().0;
    let source_channels = supported.channels();
    let sample_format = supported.sample_format();

    info!(
        rate = source_rate,
        channels = source_channels,
        format = ?sample_format,
        "capture format"
    );

    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop = stop_flag.clone();

    let err_callback = |err: cpal::StreamError| {
        error!("audio capture error: {}", err);
    };

    let config: cpal::StreamConfig = supported.into();

    let stream = match sample_format {
        cpal::SampleFormat::I16 => device.build_input_stream(
            &config,
            move |data: &[i16], _: &cpal::InputCallbackInfo| {
                if stop.load(Ordering::Relaxed) {
                    return;
                }
                let pcm = convert_to_16khz_mono_i16(data, source_rate, source_channels);
                let bytes = samples_to_bytes(&pcm);
                let _ = chunk_tx.send(bytes);
            },
            err_callback,
            None,
        )?,
        cpal::SampleFormat::F32 => device.build_input_stream(
            &config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if stop.load(Ordering::Relaxed) {
                    return;
                }
                let i16_data: Vec<i16> = data
                    .iter()
                    .map(|&s| (s * 32767.0).clamp(-32768.0, 32767.0) as i16)
                    .collect();
                let pcm = convert_to_16khz_mono_i16(&i16_data, source_rate, source_channels);
                let bytes = samples_to_bytes(&pcm);
                let _ = chunk_tx.send(bytes);
            },
            err_callback,
            None,
        )?,
        _ => anyhow::bail!("unsupported sample format: {:?}", sample_format),
    };

    stream.play().context("starting audio stream")?;

    Ok(CaptureHandle {
        _stream: stream,
        stop_flag,
    })
}

fn convert_to_16khz_mono_i16(samples: &[i16], source_rate: u32, channels: u16) -> Vec<i16> {
    let mono: Vec<i16> = if channels > 1 {
        samples
            .chunks(channels as usize)
            .map(|frame| {
                let sum: i32 = frame.iter().map(|&s| s as i32).sum();
                (sum / channels as i32) as i16
            })
            .collect()
    } else {
        samples.to_vec()
    };

    if source_rate == 16000 {
        return mono;
    }

    let ratio = source_rate as f64 / 16000.0;
    let new_len = (mono.len() as f64 / ratio) as usize;
    (0..new_len)
        .map(|i| {
            let src_idx = i as f64 * ratio;
            let idx = src_idx as usize;
            if idx + 1 < mono.len() {
                let frac = src_idx - idx as f64;
                ((mono[idx] as f64) * (1.0 - frac) + (mono[idx + 1] as f64) * frac) as i16
            } else {
                mono[idx.min(mono.len() - 1)]
            }
        })
        .collect()
}

fn samples_to_bytes(samples: &[i16]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for &s in samples {
        bytes.extend_from_slice(&s.to_le_bytes());
    }
    bytes
}

/// Wrap raw 16 kHz mono 16-bit PCM bytes in a standard 44-byte WAV header.
pub fn pcm_to_wav(pcm: &[u8]) -> Vec<u8> {
    const SAMPLE_RATE: u32 = 16000;
    const CHANNELS: u16 = 1;
    const BITS_PER_SAMPLE: u16 = 16;
    let byte_rate = SAMPLE_RATE * CHANNELS as u32 * (BITS_PER_SAMPLE as u32 / 8);
    let block_align = CHANNELS * (BITS_PER_SAMPLE / 8);

    let mut wav = Vec::with_capacity(44 + pcm.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + pcm.len() as u32).to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes()); // fmt chunk size
    wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
    wav.extend_from_slice(&CHANNELS.to_le_bytes());
    wav.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&BITS_PER_SAMPLE.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(pcm.len() as u32).to_le_bytes());
    wav.extend_from_slice(pcm);
    wav
}

/// Calculate the root-mean-square (RMS) energy level of 16-bit PCM audio.
pub fn calculate_rms(pcm: &[u8]) -> f32 {
    if pcm.len() < 2 {
        return 0.0;
    }
    let mut sum = 0.0f64;
    let count = pcm.len() / 2;
    for chunk in pcm.chunks_exact(2) {
        let sample = i16::from_le_bytes([chunk[0], chunk[1]]) as f64;
        sum += sample * sample;
    }
    ((sum / count as f64).sqrt()) as f32
}

/// Check if the PCM audio is effectively silence (below energy threshold).
/// Standard ambient microphone noise floor is typically 50-150 RMS.
pub fn is_silence(pcm: &[u8], threshold: f32) -> bool {
    calculate_rms(pcm) < threshold
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_rms_silence() {
        let zero_pcm = vec![0u8; 3200];
        assert_eq!(calculate_rms(&zero_pcm), 0.0);
        assert!(is_silence(&zero_pcm, 100.0));
    }

    #[test]
    fn test_calculate_rms_signal() {
        let mut signal_pcm = Vec::new();
        for _ in 0..1000 {
            signal_pcm.extend_from_slice(&1000i16.to_le_bytes());
        }
        let rms = calculate_rms(&signal_pcm);
        assert!((rms - 1000.0).abs() < 1.0);
        assert!(!is_silence(&signal_pcm, 200.0));
    }
}
