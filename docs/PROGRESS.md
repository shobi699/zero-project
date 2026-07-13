# PROGRESS.md

هر فاز پس از اتمام، یک ورودی اینجا اضافه می‌کند:
- فاز و تاریخ
- چه ساخته شد
- انحراف از سند مشخصات (اگر بود)
- مسائل باز

---

## فاز ۰ — Repo scaffold & Persian STT benchmark harness
- تاریخ: 2026-07-13
- **ساخته شد:**
  - ساختار مونوریپو: `zero-daemon/` (Cargo)، `zero-studio/` (Tauri v2)، `zero-server/` (NestJS)، `tools/stt-bench/`
  - فضای کاری Cargo با اعضا: zero-daemon + tools/stt-bench
  - CI: GitHub Actions — Rust build+clippy+test، NestJS build+test، Tauri build
  - هارنس بنچمارک STT با trait `SttProvider` و ۳ آداپتور (Whisper API، Google STT، Azure STT) + dummy برای تست
  - محاسبه WER/CER با ۶ تست واحد
  - گزارش مارک‌داون مقایسه‌ای با `cargo run -p stt-bench -- --report`
  - مشخصات corpus: `docs/CORPUS-SPEC.md` (۴ دسته: محاوره، رسمی، مخلوط، اسامی خاص)
  - CLAUDE.md به‌روز شده با دستورات build/test و معماری
- **انحراف از سند:** ندارد
- **مسائل باز:**
  - فایل‌های صوتی corpus باید دستی ضبط شوند (هارنس آماده است)
  - Rust روی D: نصب شد (فضای C: کم بود) — `RUSTUP_HOME=D:\rustup` و `CARGO_HOME=D:\cargo`
