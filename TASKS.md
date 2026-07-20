# TASKS.md — Zero build plan

Work phases strictly in order. Each phase = one branch. A phase is done only when its acceptance criteria pass and `docs/PROGRESS.md` is updated.

---

## Chapter 1: Core

## Phase 0 — Repo scaffold & Persian STT benchmark harness
- [x] Monorepo layout: `zero-daemon/` (cargo), `zero-studio/` (tauri), `zero-server/` (nest), `docs/`.
- [x] CI: cargo build + clippy + test, nest build + test, tauri build (Windows runner).
- [x] Benchmark harness (CLI in `tools/stt-bench/`): feeds WAV files from `tools/stt-bench/corpus/` to provider adapters, computes WER/CER for Persian, latency, cost per minute. Adapters as a trait; implement 2–3 candidate providers behind env-var keys.
- [x] Corpus spec doc: colloquial Persian, formal Persian, mixed fa/en, proper nouns. (Human records the audio; harness must run on whatever is in the folder.)
- Acceptance: `cargo run -p stt-bench -- --report` produces a markdown comparison report from sample files. ✅

## Phase 1 — Minimal daemon (ugly but real)
- [x] Global hotkey (RegisterHotKey), tap-to-talk only, debounce 150 ms.
- [x] WASAPI capture → 16 kHz mono PCM, encrypted temp file buffering in %LOCALAPPDATA%\Zero\tmp.
- [x] WebSocket client streaming chunks (200–300 ms) to server, receiving partial/final text.
- [x] Clipboard-only delivery + "کپی شد" toast (Windows notification).
- [x] Tray icon with Exit.
- Acceptance: press hotkey in any app → speak Persian → text lands in clipboard within 1 s of finishing; killing the daemon mid-recording leaves a recoverable temp file. ✅

## Phase 2 — Server: auth, quota, gateway
- [x] NestJS: email/OTP auth, JWT + refresh for daemon.
- [x] STT gateway: provider adapter trait (from Phase 0 winners), priority table in Postgres, health-check loop, automatic failover, WebSocket endpoint speaking the internal contract (PCM in, partial/final out).
- [x] Quota service: Redis counter per user-month, 30-min free tier, "quota exhausted" event pushed on the socket. No audio persisted; logs are metadata-only.
- Acceptance: e2e test — authed client streams audio, gets text, quota decremented; kill primary provider mid-stream in a test, secondary takes over on next request. ✅

## Phase 3 — Full text injector
- [x] Destination snapshot at recording start: foreground window, focused UIA element, editable?, process name. (`injector.rs:take_destination_snapshot`)
- [x] Strategy 1: UI Automation TextPattern/ValuePattern insert. (`injector.rs` — UIA cascade)
- [x] Strategy 2: SendInput with KEYEVENTF_UNICODE, throttled 200–400 chars/s. (`injector.rs` — 3ms/char throttle)
- [x] Strategy 3: clipboard + Ctrl+V + restore previous clipboard after 300 ms. (`injector.rs`)
- [x] Silent fallback chain, non-editable snapshot → straight to clipboard mode; closed window → clipboard mode.
- [x] Request queue: max 1 concurrent injection, FIFO depth 3. (`InjectorQueueManager`)
- [x] Injector behind a trait with a mock impl; unit-test the strategy selection matrix. (6 unit tests in `injector.rs`)
- [ ] Manual test checklist: Word, Telegram Desktop, Chrome address bar + textarea, VS Code, Notepad — Persian with half-spaces intact.
- Acceptance: manual checklist passes in target apps; Persian half-spaces (U+200C) preserved in all.

## Phase 4 — Overlay & body language
- [x] Layered click-through window (WS_EX_LAYERED | TRANSPARENT | TOOLWINDOW), circle following cursor at fixed offset, 30 fps while active, DPI-aware. (`overlay.rs:draw_overlay`)
- [x] States: blue pulse (Listening), amber spin (Processing), green (Success), red + message (Error). (`overlay.rs:OverlayState`)
- [x] Push-to-talk via WH_KEYBOARD_LL. (`hotkey.rs` — modifier release detection, 150ms debounce)
- [ ] Alternative corner-widget mode; setting to choose between floating circle and corner widget.
- Acceptance: overlay never steals focus or clicks; states match the error matrix in spec §9.

## Phase 5 — Local engine & router
- [x] whisper integration via whisper-cli subprocess; model manager (download, checksum verification, lazy load, unload after 5 min idle). (`local_engine.rs`, `ModelManager.tsx`)
- [x] Engine router decision table from spec §3.4 incl. deferred queue (transcribe later → history + notification, no auto-insert). (`router.rs:route_transcription`)
- [x] Mid-stream connection loss: keep recording from disk buffer, run whole file through local engine, discard partial cloud text. (`router.rs` — WAV construction + local fallback)
- [ ] Airplane-mode test (manual verification: dictation with local model, without model audio queued and transcribed on reconnect).
- Acceptance: airplane-mode test passes; deferred queue processes on reconnect.

## Phase 6 — Studio
- [x] Tauri app, Named Pipe protocol to daemon (get/set settings, history, test-mic, download-model, login, usage). (`ipc.rs` — newline-delimited JSON, Subscribe model)
- [x] Onboarding flow: hotkey config → server connection → model download → mic check. (`Onboarding.tsx` — 4-step wizard)
- [x] Settings page: hotkey, engine mode cards, API key management, quota display. (`Settings.tsx`)
- [x] RTL-first, fa/en i18n.
- [ ] History view: connect to daemon IPC / local storage (currently uses hardcoded mock data).
- [ ] Blacklist page (not yet implemented).
- [ ] "Delete all data" button.
- Acceptance: fresh install → productive dictation in under 60 s without docs.

## Phase 7 — Persian rules & hardening
- [x] Deterministic Persian pipeline (spec §6): char normalization (ي/ك → ی/ک), half-space joins with exception list, spoken punctuation (fa+en), digit policy. Each rule individually toggleable. (`persian.rs` — 3 unit tests)
- [ ] i18n file consolidation: all user-facing strings in single fa/en file.
- [ ] `GATEWAY_URL` to config (currently hardcoded).
- [ ] DPAPI for encryption key (currently plain file in %LOCALAPPDATA%).
- [ ] Performance harness in CI asserting spec §8 budgets (RAM < 50MB, installer < 15MB).
- [ ] Watchdog task (auto-restart daemon), silent updater (stable/beta), remote config fetch (quota, RTL-problem app list, provider priorities, feature flags).
- [ ] Code-signing step documented in release pipeline.
- [ ] Real-time chunk streaming (currently batch sends after stop — increases latency).
- Acceptance: all §8 budget tests green; recovery test: crash daemon mid-recording → after restart, audio recovered to history.

---

## Chapter 2: Growth (post-v1)

> These phases begin only after Chapter 1 is complete and ADRs 005–008 are confirmed.
> See `docs/DECISIONS.md` for architectural decisions.

## Phase 8 — Zero Notes (دفتر یادداشت)
- [ ] Local SQLite tables via rusqlite: `notes(id, title, body, tags, pinned, created/updated)` + FTS5 for Persian full-text search.
- [ ] IPC messages on Named Pipe: CRUD notes, search, pin/unpin.
- [ ] Studio UI: note list with search/tag/pin, simple editor, export to Markdown and Word (.docx via frontend lib).
- [ ] "Dictate to note" mode: hotkey or Studio button routes dictation output to current note instead of clipboard.
- Acceptance: dictate → note saved → searchable in Persian with half-spaces; export to .md and .docx is clean.

## Phase 9 — Simultaneous Translation (ترجمه همزمان)
- [ ] Server: TranslationProvider trait behind gateway (same pattern as STT), keys server-side only; separate quota `quota:translate:{userId}:{yyyymm}`.
- [ ] Daemon: "dictate + translate" mode fa→en and en→fa; final STT text sent to translation service before injection.
- [ ] Studio: translate toggle + target language selector; overlay shows "translating" state (amber, longer duration).
- Acceptance: speak Persian → English text inserted at cursor < 2 s after speech ends.

## Phase 10 — Meeting Mode & Transcript (حالت جلسه)
- [ ] Long recording (30–60 min) with segmented encrypted buffer (`buffer.rs` extended); start/stop from Studio or hotkey.
- [ ] File import in Studio (wav/mp3) → gateway or local engine → transcript with timestamps.
- [ ] Output: full text + SRT subtitle + auto-save to Zero Notes (depends on Phase 8).
- [ ] LLM summarization (server-side, optional/Pro) — requires ADR-007.
- Acceptance: 30-min file → complete transcript; crash mid-meeting → audio recovered from buffer.

## Phase 11 — Text Intelligence: Dictionary, Snippets, Voice Commands
> Chapter 2 — begins after v1 completion. Requires ADR-008 confirmation.

- [ ] Personal dictionary: `dict(word_wrong → word_correct, proper_nouns)` table; applied in `persian.rs` pipeline after STT; managed in Studio.
- [ ] Voice snippets: trigger phrase ("امضای من") → insert ready text; detection on final text before injection.
- [ ] Voice edit commands on pre-insert buffer: "پاکش کن" (delete last word), "خط جدید" (newline), "همه‌اش را پاک کن" (clear all); fa+en command list in i18n.
- Acceptance: full unit test suite on text pipeline (no hardware); manual checklist for injection.

## Phase 12 — Usage Stats & LLM Polish Layer
> Chapter 2 — begins after v1 completion.

- [ ] Usage stats from local history: minutes spoken, words dictated, weekly chart in Studio; all local, no telemetry.
- [ ] LLM Polish (Pro): server-side service (same gateway pattern) with modes "تصحیح نگارش", "رسمی", "غیررسمی"; toggle before injection; Pro users only.
- Acceptance: stats calculated correctly from history; polish on → corrected text inserted; polish off → raw text.
