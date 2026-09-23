# Bug Fix: Whisper Medium Low Accuracy & STT Model Management Sync

- **Slug**: sst-bag
- **Fixed**: 2026-09-23T20:25:00+03:30
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

اعمال بهینه‌سازی‌های جامع روی موتور تبدیل صوت Whisper محلی (`whisper-cli`) شامل پرچم‌های ضد هذیان، پردازش موازی پویا، فیلتر تشخیص انرژی سکوت (RMS)، اعتبارسنجی باینری مدل در IPC و همگام‌سازی کش موتور، به همراه بازطراحی و ارتقای کامل صفحه مدیریت مدل‌های STT در Zero Studio با دسته‌بندی طلایی زبان فارسی و تست زنده سرعت و استنتاج.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `zero-daemon/src/audio.rs` | modified | افزودن محاسبه سطح انرژی صوتی (`calculate_rms`)، تشخیص سکوت (`is_silence`) و تست‌های واحد خودکار |
| `zero-daemon/src/local_engine.rs` | modified | تجهیز `whisper-cli` به پرچم‌های ضد هذیان (`-sns`, `-nf`, `-tp 0.0`, `-nth 0.65`, `-np`, `-nt`)، استفاده از ۶ الی ۸ ترد موازی پردازنده، پاکسازی متن خروجی و متد `invalidate_model` |
| `zero-daemon/src/router.rs` | modified | گیتینگ انرژی صوتی قبل از ارسال به مدل سنگین محلی برای جلوگیری از هدررفت منابع و هذیان در سکوت |
| `zero-daemon/src/ipc.rs` | modified | بررسی سلامت باینری مدل در دستور `SetActiveModel` و ابطال کش داخلی موتور جهت اعمال آنی تغییر مدل |
| `zero-studio/src-tauri/src/main.rs` | modified | افزودن دستور تائوری `test_model_inference` برای تست بنچمارک زنده زمان استنتاج و سلامت باینری مدل |
| `zero-studio/src/components/ModelManager.tsx` | modified | بازطراحی کامل با تب‌های دسته‌بندی («🌟 پیشنهادی طلایی فارسی»، «⚡ سریع و روزمره»، «🎯 فوق‌دقیق و سنگین»)، نمایش توصیه‌های سخت‌افزاری رم و پردازنده، و دکمه تست زنده سرعت استنتاج |

## Diff Highlights

### ۱. پرچم‌های ضد هذیان و تردهای پویا در `local_engine.rs`:
```rust
        let num_threads = std::thread::available_parallelism()
            .map(|n| (n.get() / 2).max(4).min(8).to_string())
            .unwrap_or_else(|_| "6".to_string());

        let output_future = cmd
            .arg("-m").arg(&model_path)
            .arg("-f").arg(wav_path)
            .arg("-nt")             // No timestamps
            .arg("-np")             // No prints (clean output)
            .arg("-sns")            // Suppress non-speech tokens (anti-hallucination)
            .arg("-nf")             // No temperature fallback
            .arg("-tp").arg("0.0")   // Greedy decoding (highest accuracy & determinism)
            .arg("-nth").arg("0.65")// No-speech threshold
            .arg("-l").arg("fa")    // Persian language
            .arg("-t").arg(&num_threads)
            .output();
```

### ۲. فیلتر سطح انرژی و سکوت در `audio.rs`:
```rust
pub fn calculate_rms(pcm: &[u8]) -> f32 {
    let mut sum = 0.0f64;
    let count = pcm.len() / 2;
    for chunk in pcm.chunks_exact(2) {
        let sample = i16::from_le_bytes([chunk[0], chunk[1]]) as f64;
        sum += sample * sample;
    }
    ((sum / count as f64).sqrt()) as f32
}

pub fn is_silence(pcm: &[u8], threshold: f32) -> bool {
    calculate_rms(pcm) < threshold
}
```

## Tests Added or Updated

- `zero-daemon/src/audio.rs::tests::test_calculate_rms_silence` — سنجش تشخیص دقیق سکوت دیجیتال
- `zero-daemon/src/audio.rs::tests::test_calculate_rms_signal` — سنجش دقیق سطح انرژی صوت نرمال

## Local Verification

- Commands run: `cargo test -p zero-daemon audio` → `test result: ok. 2 passed; 0 failed`
- Commands run: `cargo check --workspace` → کامپایل موفق کل فضای کاری Rust با صفر خطا و صفر اخطار
- Commands run: `cargo check --manifest-path zero-studio/src-tauri/Cargo.toml` → کامپایل موفق بک‌اند تائوری استودیو با صفر خطا

## Deviations from Assessment

هیچ انحرافی وجود ندارد؛ تمامی موارد پیشنهادی ارزیابی به طور کامل پیاده‌سازی شدند و قابلیت بنچمارک استنتاج زنده نیز به تائوری اضافه گردید.

## Follow-ups

- بررسی تایپ‌چک فرانت‌اند استودیو با `npm run build` یا تست کامپوننت در Vite.
