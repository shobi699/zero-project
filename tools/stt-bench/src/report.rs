use std::time::Duration;

pub struct EntryResult {
    pub name: String,
    pub reference: String,
    pub hypothesis: String,
    pub wer: f64,
    pub cer: f64,
    pub latency: Duration,
    pub audio_duration: Duration,
    pub error: Option<String>,
}

struct ProviderSummary {
    name: String,
    cost_per_min: f64,
    results: Vec<EntryResult>,
}

pub struct BenchmarkReport {
    providers: Vec<ProviderSummary>,
}

impl BenchmarkReport {
    pub fn new() -> Self {
        Self {
            providers: Vec::new(),
        }
    }

    pub fn add_provider_results(
        &mut self,
        name: &str,
        cost_per_min: f64,
        results: Vec<EntryResult>,
    ) {
        self.providers.push(ProviderSummary {
            name: name.to_string(),
            cost_per_min,
            results,
        });
    }

    pub fn to_summary(&self) -> String {
        let mut out = String::from("=== Summary ===\n\n");
        out.push_str(&format!(
            "{:<15} {:>8} {:>8} {:>10} {:>12}\n",
            "Provider", "Avg WER", "Avg CER", "Avg Lat", "$/min"
        ));
        out.push_str(&"-".repeat(57));
        out.push('\n');

        for p in &self.providers {
            let (avg_wer, avg_cer, avg_lat) = averages(&p.results);
            out.push_str(&format!(
                "{:<15} {:>7.1}% {:>7.1}% {:>8.0}ms {:>10.4}\n",
                p.name,
                avg_wer * 100.0,
                avg_cer * 100.0,
                avg_lat.as_millis(),
                p.cost_per_min
            ));
        }

        out
    }

    pub fn to_markdown(&self) -> String {
        let mut md = String::new();

        md.push_str("# Persian STT Provider Benchmark Report\n\n");
        md.push_str(&format!(
            "Generated: {}\n\n",
            chrono::Local::now().format("%Y-%m-%d %H:%M")
        ));

        // Summary table
        md.push_str("## Summary\n\n");
        md.push_str("| Provider | Avg WER | Avg CER | Avg Latency | Cost/min (USD) | Errors |\n");
        md.push_str("|----------|---------|---------|-------------|----------------|--------|\n");

        for p in &self.providers {
            let (avg_wer, avg_cer, avg_lat) = averages(&p.results);
            let error_count = p.results.iter().filter(|r| r.error.is_some()).count();
            md.push_str(&format!(
                "| {} | {:.1}% | {:.1}% | {:.0} ms | ${:.4} | {}/{} |\n",
                p.name,
                avg_wer * 100.0,
                avg_cer * 100.0,
                avg_lat.as_millis(),
                p.cost_per_min,
                error_count,
                p.results.len()
            ));
        }

        // Per-provider detail
        for p in &self.providers {
            md.push_str(&format!("\n## {} — Detail\n\n", p.name));
            md.push_str("| Sample | WER | CER | Latency | Audio Dur | Status |\n");
            md.push_str("|--------|-----|-----|---------|-----------|--------|\n");

            for r in &p.results {
                let status = if let Some(ref e) = r.error {
                    format!("FAIL: {}", truncate(e, 40))
                } else {
                    "OK".to_string()
                };

                md.push_str(&format!(
                    "| {} | {:.1}% | {:.1}% | {:.0} ms | {:.1}s | {} |\n",
                    r.name,
                    r.wer * 100.0,
                    r.cer * 100.0,
                    r.latency.as_millis(),
                    r.audio_duration.as_secs_f64(),
                    status
                ));
            }

            // Show transcription comparisons for successful results
            let successful: Vec<_> = p.results.iter().filter(|r| r.error.is_none()).collect();
            if !successful.is_empty() {
                md.push_str(&format!("\n### {} — Transcriptions\n\n", p.name));
                for r in successful {
                    md.push_str(&format!("**{}**\n", r.name));
                    md.push_str(&format!("- Reference:  {}\n", r.reference));
                    md.push_str(&format!("- Hypothesis: {}\n\n", r.hypothesis));
                }
            }
        }

        md
    }
}

fn averages(results: &[EntryResult]) -> (f64, f64, Duration) {
    let successful: Vec<_> = results.iter().filter(|r| r.error.is_none()).collect();
    if successful.is_empty() {
        return (1.0, 1.0, Duration::ZERO);
    }

    let n = successful.len() as f64;
    let avg_wer = successful.iter().map(|r| r.wer).sum::<f64>() / n;
    let avg_cer = successful.iter().map(|r| r.cer).sum::<f64>() / n;
    let avg_lat =
        Duration::from_secs_f64(successful.iter().map(|r| r.latency.as_secs_f64()).sum::<f64>() / n);

    (avg_wer, avg_cer, avg_lat)
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max])
    }
}
