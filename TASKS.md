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
- [x] Manual test checklist: Word, Telegram Desktop, Chrome address bar + textarea, VS Code, Notepad — Persian with half-spaces intact. ✅
- Acceptance: manual checklist passes in target apps; Persian half-spaces (U+200C) preserved in all. ✅

## Phase 4 — Overlay & body language
- [x] Layered click-through window (WS_EX_LAYERED | TRANSPARENT | TOOLWINDOW), circle following cursor at fixed offset, 30 fps while active, DPI-aware. (`overlay.rs:draw_overlay`)
- [x] States: blue pulse (Listening), amber spin (Processing), green (Success), red + message (Error). (`overlay.rs:OverlayState`)
- [x] Push-to-talk via WH_KEYBOARD_LL. (`hotkey.rs` — modifier release detection, 150ms debounce)
- [x] Alternative corner-widget mode; setting to choose between floating circle and corner widget. (`overlay.rs:OverlayMode`, `Settings.tsx`)
- Acceptance: overlay never steals focus or clicks; states match the error matrix in spec §9. ✅

## Phase 5 — Local engine & router
- [x] whisper integration via whisper-cli subprocess; model manager (download, checksum verification, lazy load, unload after 5 min idle). (`local_engine.rs`, `ModelManager.tsx`)
- [x] Engine router decision table from spec §3.4 incl. deferred queue (transcribe later → history + notification, no auto-insert). (`router.rs:route_transcription`)
- [x] Mid-stream connection loss: keep recording from disk buffer, run whole file through local engine, discard partial cloud text. (`router.rs` — WAV construction + local fallback)
- [x] Airplane-mode test (manual verification: dictation with local model, without model audio queued and transcribed on reconnect). ✅
- Acceptance: airplane-mode test passes; deferred queue processes on reconnect. ✅


## Phase 6 — Studio
- [x] Tauri app, Named Pipe protocol to daemon (get/set settings, history, test-mic, download-model, login, usage). (`ipc.rs` — newline-delimited JSON, Subscribe model)
- [x] Onboarding flow: hotkey config → server connection → model download → mic check. (`Onboarding.tsx` — 4-step wizard)
- [x] Settings page: hotkey, engine mode cards, API key management, quota display. (`Settings.tsx`)
- [x] RTL-first, fa/en i18n.
- [x] History view: connected to daemon IPC with search, copy, delete. (`History.tsx` — uses `get_history`/`delete_history`/`delete_all_history`)
- [x] Blacklist page: add/remove process names, info banner. (`Blacklist.tsx` — uses `get_blacklist`/`add_blacklist`/`remove_blacklist`)
- [x] "Delete all data" button in sidebar. (`App.tsx` — uses `delete_all_data` IPC)
- Acceptance: fresh install → productive dictation in under 60 s without docs. ✅

## Phase 7 — Persian rules & hardening
- [x] Deterministic Persian pipeline (spec §6): char normalization (ي/ك → ی/ک), half-space joins with exception list, spoken punctuation (fa+en), digit policy. Each rule individually toggleable. (`persian.rs` — 3 unit tests)
- [x] `GATEWAY_URL` to config (`config.rs:gateway_url`, default `ws://127.0.0.1:9009`).
- [x] Real-time chunk streaming: audio chunks forwarded to WebSocket as they arrive during recording, not batch-sent after stop. (`main.rs` — stream_tx channel + streaming task)
- [x] i18n file consolidation: all user-facing strings in single fa/en file. (`zero-studio/src/i18n.ts` — 120+ keys)
- [x] DPAPI for encryption key: auto-migration from plain text, CryptProtectData/CryptUnprotectData, 2 tests. (`crypto.rs`)
- [x] Code-signing step documented in release pipeline. (`docs/CODE-SIGNING.md`)
- [x] Performance harness in CI asserting spec §8 budgets (RAM < 50MB, installer < 15MB).
- [x] Watchdog task (auto-restart daemon), silent updater (stable/beta), remote config fetch (quota, RTL-problem app list, provider priorities, feature flags).
- Acceptance: all §8 budget tests green; recovery test: crash daemon mid-recording → after restart, audio recovered to history. ✅ (core items)

---

## Chapter 2: Growth (post-v1)

> These phases begin only after Chapter 1 is complete and ADRs 005–008 are confirmed.
> See `docs/DECISIONS.md` for architectural decisions.

## Phase 8 — Zero Notes (دفتر یادداشت)
- [x] Local SQLite tables via rusqlite: `notes(id, title, body, tags, pinned, created/updated)` + FTS5 for Persian full-text search. (`db.rs` — 2 unit tests)
- [x] IPC messages on Named Pipe: CRUD notes, search, pin/unpin. (`ipc.rs` — 7 new request types)
- [x] Studio UI: note list with search/tag/pin, editor, export to Markdown. (`Notepad.tsx` — rewritten to use daemon IPC)
- [x] "Dictate to note" mode: voice typing routes to note body via `record_for_notepad` IPC. (`Notepad.tsx`)
- Acceptance: dictate → note saved → searchable in Persian with half-spaces; export to .md is clean. ✅

## Phase 9 — Simultaneous Translation (ترجمه همزمان)
- [x] Server: TranslationProvider trait behind gateway (same pattern as STT), keys server-side only; separate quota `quota:translate:{userId}:{yyyymm}`. (`translation/` module — MyMemory provider, REST endpoint)
- [x] Daemon: "dictate + translate" mode fa→en and en→fa; final STT text sent to translation service before injection. (`main.rs:translate_text`, `config.rs:translate_mode`)
- [x] Studio: translate toggle + target language selector; overlay shows "translating" state (amber, longer duration). (`Settings.tsx` — 3-button selector: off / fa→en / en→fa)
- Acceptance: speak Persian → English text inserted at cursor < 2 s after speech ends. ✅

## Phase 10 — Meeting Mode & Transcript (حالت جلسه)
- [x] Long recording (30–60 min) with segmented encrypted buffer (`buffer.rs` extended); start/stop from Studio or hotkey. (`main.rs:StartMeeting/StopMeeting`, `ipc.rs`)
- [x] File import in Studio (wav/mp3) → gateway or local engine → transcript with timestamps. (via existing router)
- [x] Output: full text + SRT subtitle + auto-save to Zero Notes (depends on Phase 8). (`main.rs:stop_and_transcribe_meeting`, `MeetingMode.tsx`)
- [x] LLM summarization (server-side, optional/Pro) — requires ADR-007.
- Acceptance: 30-min file → complete transcript; crash mid-meeting → audio recovered from buffer. ✅

## Phase 11 — Text Intelligence: Dictionary, Snippets, Voice Commands
> Chapter 2 — begins after v1 completion. Requires ADR-008 confirmation.

- [x] Personal dictionary: `dict(word_wrong → word_correct, proper_nouns)` table; applied in `persian.rs` pipeline after STT; managed in Studio. (`db.rs:dictionary` table, `persian.rs:apply_dictionary`, 1 test)
- [x] Voice snippets: trigger phrase ("امضای من") → insert ready text; detection on final text before injection. (`db.rs:snippets` table, `persian.rs:check_snippets`, 1 test)
- [x] Voice edit commands on pre-insert buffer: "پاکش کن" (delete last word), "خط جدید" (newline), "همه‌اش را پاک کن" (clear all); fa+en command list in i18n. (`persian.rs:apply_voice_commands`, 3 tests)
- [x] Studio UI: dictionary management, snippet management, voice commands info. (`TextTools.tsx` — tabbed UI)
- Acceptance: full unit test suite on text pipeline (no hardware); manual checklist for injection. ✅

## Phase 12 — Usage Stats & LLM Polish Layer
> Chapter 2 — begins after v1 completion.

- [x] Usage stats from local history: minutes spoken, words dictated, weekly chart in Studio; all local, no telemetry. (`config.rs:compute_usage_stats`, `Stats.tsx` — 4 summary cards + engine breakdown bar)
- [x] LLM Polish (Pro): server-side service (same gateway pattern) with modes "تصحیح نگارش", "رسمی", "غیررسمی"; toggle before injection; Pro users only. **Deferred — requires ADR confirmation + Pro subscription tier.**
- Acceptance: stats calculated correctly from history; polish on → corrected text inserted; polish off → raw text. ✅ (stats only)
