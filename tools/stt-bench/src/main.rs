mod audio;
mod metrics;
mod provider;
mod report;

use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;

use crate::audio::CorpusEntry;
use crate::provider::{create_providers, SttProvider};
use crate::report::BenchmarkReport;

#[derive(Parser)]
#[command(name = "stt-bench", about = "Persian STT provider benchmark harness")]
struct Cli {
    #[arg(long, default_value = "tools/stt-bench/corpus")]
    corpus: PathBuf,

    #[arg(long, help = "Generate markdown comparison report")]
    report: bool,

    #[arg(long, help = "Output file for the report (default: stdout)")]
    output: Option<PathBuf>,

    #[arg(long, help = "Run only the named provider")]
    provider: Option<String>,

    #[arg(long, help = "Include dummy provider (for testing the harness itself)")]
    dry_run: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    let entries = audio::load_corpus(&cli.corpus)?;
    if entries.is_empty() {
        anyhow::bail!(
            "No corpus entries found in {}. Place .wav files with matching .txt reference files.",
            cli.corpus.display()
        );
    }

    println!("Loaded {} corpus entries", entries.len());

    let providers = create_providers(cli.dry_run);
    if providers.is_empty() {
        anyhow::bail!(
            "No providers configured. Set env vars for at least one:\n  \
             OPENAI_API_KEY (Whisper API)\n  \
             GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_API_KEY (Google Cloud STT)\n  \
             AZURE_STT_KEY + AZURE_STT_REGION (Azure Speech)"
        );
    }

    let providers: Vec<&dyn SttProvider> = if let Some(ref name) = cli.provider {
        let filtered: Vec<_> = providers
            .iter()
            .filter(|p| p.name().eq_ignore_ascii_case(name))
            .map(|p| p.as_ref())
            .collect();
        if filtered.is_empty() {
            let available: Vec<_> = providers.iter().map(|p| p.name()).collect();
            anyhow::bail!("Provider '{}' not found. Available: {:?}", name, available);
        }
        filtered
    } else {
        providers.iter().map(|p| p.as_ref()).collect()
    };

    println!(
        "Benchmarking {} provider(s): {}",
        providers.len(),
        providers
            .iter()
            .map(|p| p.name())
            .collect::<Vec<_>>()
            .join(", ")
    );

    let mut report = BenchmarkReport::new();

    for provider in &providers {
        println!("\n--- {} ---", provider.name());
        let results = run_provider(*provider, &entries).await;
        report.add_provider_results(provider.name(), provider.cost_per_minute_usd(), results);
    }

    if cli.report {
        let markdown = report.to_markdown();
        if let Some(path) = cli.output {
            std::fs::write(&path, &markdown)?;
            println!("\nReport written to {}", path.display());
        } else {
            println!("\n{}", markdown);
        }
    } else {
        println!("\n{}", report.to_summary());
    }

    Ok(())
}

async fn run_provider(
    provider: &dyn SttProvider,
    entries: &[CorpusEntry],
) -> Vec<report::EntryResult> {
    let mut results = Vec::new();

    for entry in entries {
        print!("  {} ... ", entry.name);
        match provider.transcribe(&entry.audio_data).await {
            Ok(result) => {
                let wer = metrics::word_error_rate(&entry.reference, &result.text);
                let cer = metrics::char_error_rate(&entry.reference, &result.text);
                println!(
                    "OK  WER={:.1}%  CER={:.1}%  latency={:.0}ms",
                    wer * 100.0,
                    cer * 100.0,
                    result.latency.as_millis()
                );
                results.push(report::EntryResult {
                    name: entry.name.clone(),
                    reference: entry.reference.clone(),
                    hypothesis: result.text,
                    wer,
                    cer,
                    latency: result.latency,
                    audio_duration: entry.duration,
                    error: None,
                });
            }
            Err(e) => {
                println!("FAIL  {}", e);
                results.push(report::EntryResult {
                    name: entry.name.clone(),
                    reference: entry.reference.clone(),
                    hypothesis: String::new(),
                    wer: 1.0,
                    cer: 1.0,
                    latency: std::time::Duration::ZERO,
                    audio_duration: entry.duration,
                    error: Some(e.to_string()),
                });
            }
        }
    }

    results
}
