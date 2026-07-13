use std::path::Path;
use std::time::Duration;

use anyhow::{Context, Result};

pub struct AudioData {
    pub samples: Vec<i16>,
    pub sample_rate: u32,
}

pub struct CorpusEntry {
    pub name: String,
    pub audio_data: AudioData,
    pub reference: String,
    pub duration: Duration,
}

pub fn load_corpus(dir: &Path) -> Result<Vec<CorpusEntry>> {
    if !dir.exists() {
        anyhow::bail!("Corpus directory does not exist: {}", dir.display());
    }

    let mut entries = Vec::new();

    let mut wav_files: Vec<_> = std::fs::read_dir(dir)
        .context("reading corpus directory")?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("wav"))
        })
        .collect();

    wav_files.sort_by_key(|e| e.file_name());

    for wav_entry in wav_files {
        let wav_path = wav_entry.path();
        let stem = wav_path.file_stem().unwrap().to_string_lossy().to_string();
        let txt_path = wav_path.with_extension("txt");

        if !txt_path.exists() {
            eprintln!(
                "  SKIP {}: no matching .txt reference file",
                wav_path.display()
            );
            continue;
        }

        let reference = std::fs::read_to_string(&txt_path)
            .with_context(|| format!("reading {}", txt_path.display()))?
            .trim()
            .to_string();

        let audio_data =
            load_wav(&wav_path).with_context(|| format!("loading {}", wav_path.display()))?;

        let duration_secs = audio_data.samples.len() as f64 / audio_data.sample_rate as f64;
        let duration = Duration::from_secs_f64(duration_secs);

        entries.push(CorpusEntry {
            name: stem,
            audio_data,
            reference,
            duration,
        });
    }

    Ok(entries)
}

fn load_wav(path: &Path) -> Result<AudioData> {
    let reader = hound::WavReader::open(path)?;
    let spec = reader.spec();

    let samples: Vec<i16> = match spec.sample_format {
        hound::SampleFormat::Int => match spec.bits_per_sample {
            16 => reader.into_samples::<i16>().collect::<Result<_, _>>()?,
            24 => reader
                .into_samples::<i32>()
                .map(|s| s.map(|v| (v >> 8) as i16))
                .collect::<Result<_, _>>()?,
            32 => reader
                .into_samples::<i32>()
                .map(|s| s.map(|v| (v >> 16) as i16))
                .collect::<Result<_, _>>()?,
            _ => anyhow::bail!("unsupported bit depth: {}", spec.bits_per_sample),
        },
        hound::SampleFormat::Float => reader
            .into_samples::<f32>()
            .map(|s| s.map(|v| (v * 32767.0).clamp(-32768.0, 32767.0) as i16))
            .collect::<Result<_, _>>()?,
    };

    let samples = to_mono_16khz(samples, spec.channels, spec.sample_rate);

    Ok(AudioData {
        samples,
        sample_rate: 16000,
    })
}

fn to_mono_16khz(samples: Vec<i16>, channels: u16, source_rate: u32) -> Vec<i16> {
    let mono: Vec<i16> = if channels > 1 {
        samples
            .chunks(channels as usize)
            .map(|frame| {
                let sum: i32 = frame.iter().map(|&s| s as i32).sum();
                (sum / channels as i32) as i16
            })
            .collect()
    } else {
        samples
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

impl AudioData {
    pub fn to_wav_bytes(&self) -> Vec<u8> {
        let mut cursor = std::io::Cursor::new(Vec::new());
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: self.sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::new(&mut cursor, spec).unwrap();
        for &sample in &self.samples {
            writer.write_sample(sample).unwrap();
        }
        writer.finalize().unwrap();
        cursor.into_inner()
    }

    #[allow(dead_code)]
    pub fn duration(&self) -> Duration {
        Duration::from_secs_f64(self.samples.len() as f64 / self.sample_rate as f64)
    }
}
