# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Zero

Zero is a system-wide voice input layer for Windows: press a hotkey anywhere, speak, and transcribed text is inserted at the cursor. Two desktop processes (Daemon + Studio) + one server.

## Source of truth

- `docs/TECH-SPEC.md` — full technical specification. Do not contradict it.
- `docs/PRODUCT-STORY.md` — product vision and UX scenarios.
- `TASKS.md` — phased build plan. Work strictly in phase order.
- `docs/DECISIONS.md` — architecture decision log. If a decision is missing, add it as "پیشنهاد" (proposed) and ask before implementing.

## Build & test commands

### Rust workspace (zero-daemon + tools/stt-bench)
```
cargo build --workspace
cargo clippy --workspace -- -D warnings
cargo test --workspace
cargo test -p stt-bench               # single crate
cargo test -p stt-bench metrics       # single test module
```

### STT benchmark harness
```
# Requires provider env vars (see tools/stt-bench/.env.example)
cargo run -p stt-bench -- --report                        # all configured providers
cargo run -p stt-bench -- --report --provider whisper-api  # single provider
cargo run -p stt-bench -- --report --output report.md      # save to file
```
Corpus: place `.wav` files with matching `.txt` reference transcriptions in `tools/stt-bench/corpus/`. See `docs/CORPUS-SPEC.md` for categories and format.

### NestJS server (zero-server/)
```
cd zero-server && npm ci && npm run build && npm test
```

### Tauri studio (zero-studio/)
```
cd zero-studio && npm install && npx tauri build
```
Requires Windows with WebView2, Rust stable + MSVC toolchain, Node LTS.

### CI
GitHub Actions in `.github/workflows/ci.yml` — runs on every push/PR to main: Rust build+clippy+test, NestJS build+test, Tauri build (Windows runner).

## Architecture

```
Cargo.toml              ← workspace root (members: zero-daemon, tools/stt-bench)
zero-daemon/            ← pure Rust, always-on, no WebView
zero-studio/            ← Tauri v2 app (settings/onboarding/history UI)
  src-tauri/            ← Rust backend (NOT in workspace — Tauri manages its own cargo build)
  src/                  ← frontend (TypeScript, RTL-first)
zero-server/            ← NestJS (auth, quota, STT gateway)
tools/stt-bench/        ← benchmark CLI for evaluating STT providers on Persian
  src/provider/         ← SttProvider trait + adapters (whisper_api, google, azure)
  src/metrics.rs        ← WER/CER computation
  corpus/               ← WAV + reference TXT files (WAVs not tracked in git)
docs/                   ← specs, decisions, progress, manual test checklists
```

**Key separation:** zero-studio/src-tauri is NOT in the Cargo workspace. The workspace only contains zero-daemon and tools/*.

**IPC:** Daemon ↔ Studio communicate via Windows Named Pipe with JSON messages. Studio never touches mic/STT directly.

**STT provider trait** (`tools/stt-bench/src/provider/mod.rs`): `SttProvider` trait with `transcribe()` → adapters configured via env vars. Same trait pattern will be reused in the server gateway.

## Hard constraints (treat as failing tests)

- Daemon idle RAM < 50 MB (target 20). No WebView in daemon.
- Hotkey → mic open < 250 ms. Speech end → text inserted < 1 s P95 (cloud).
- Installer without local model < 15 MB.
- Audio NEVER lost: every capture buffered to encrypted temp files; deleted only after successful delivery.
- Blacklist check happens BEFORE mic opens. No bypass path.
- Client never holds STT provider API keys. All cloud STT via server gateway.
- Persian: U+200C half-space, normalize Arabic ي/ك → Persian ی/ک, SendInput with KEYEVENTF_UNICODE, never manual RTL reversal.

## Tech choices (do not change without DECISIONS.md entry)

- Daemon: Rust, windows-rs (RegisterHotKey, WH_KEYBOARD_LL, WASAPI, UI Automation, SendInput, layered windows), rusqlite, tokio, tungstenite.
- Local STT: whisper.cpp via whisper-rs. Lazy-load, unload after 5 min idle.
- Studio: Tauri v2 + TypeScript. RTL-first, Persian primary with English fallback.
- Server: NestJS, PostgreSQL, Redis. Quota key: `quota:{userId}:{yyyymm}` in Redis.
- Audio: 16 kHz mono PCM everywhere.

## Workflow rules

- One phase of TASKS.md per branch. Conventional commits (feat/fix/chore).
- Every phase ends with acceptance criteria passing + entry in `docs/PROGRESS.md`.
- Write tests where testable without hardware (text processing, router logic, quota, injector strategy selection behind a trait mock). Hardware-dependent tests go in `docs/MANUAL-TESTS.md`.
- Error handling per spec §9 matrix. Never show raw errors to user; worst case: "کپی شد ✓".
- All user-facing strings in a single i18n file (fa + en); Persian copy written first.

## v1 scope boundaries

**Build:** hotkey, capture, cloud+local STT, smart 3-strategy injection, overlay, history, blacklist, freemium quota, Persian text rules, offline mode.

**Do NOT build:** polish/LLM layer, context awareness, personal dictionary, draft mode window, voice commands (beyond minimal correction), macOS/Linux. Leave extension points only.

**Chapter 2 (post-v1):** Zero Notes, simultaneous translation, meeting/transcript mode, personal dictionary, voice snippets, voice edit commands, usage stats, LLM polish layer. Each requires confirmed ADR (docs/DECISIONS.md §005–008). See TASKS.md Phases 8–12.
