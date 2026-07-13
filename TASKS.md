# TASKS.md — Zero build plan (Chapter 1: Core)

Work phases strictly in order. Each phase = one branch. A phase is done only when its acceptance criteria pass and `docs/PROGRESS.md` is updated.

## Phase 0 — Repo scaffold & Persian STT benchmark harness
- [x] Monorepo layout: `zero-daemon/` (cargo), `zero-studio/` (tauri), `zero-server/` (nest), `docs/`.
- [x] CI: cargo build + clippy + test, nest build + test, tauri build (Windows runner).
- [x] Benchmark harness (CLI in `tools/stt-bench/`): feeds WAV files from `tools/stt-bench/corpus/` to provider adapters, computes WER/CER for Persian, latency, cost per minute. Adapters as a trait; implement 2–3 candidate providers behind env-var keys.
- [x] Corpus spec doc: colloquial Persian, formal Persian, mixed fa/en, proper nouns. (Human records the audio; harness must run on whatever is in the folder.)
- Acceptance: `cargo run -p stt-bench -- --report` produces a markdown comparison report from sample files. ✅

## Phase 1 — Minimal daemon (ugly but real)
- [ ] Global hotkey (RegisterHotKey), tap-to-talk only, debounce 150 ms.
- [ ] WASAPI capture → 16 kHz mono PCM, encrypted temp file buffering in %LOCALAPPDATA%\Zero\tmp.
- [ ] WebSocket client streaming chunks (200–300 ms) to server, receiving partial/final text.
- [ ] Clipboard-only delivery + "کپی شد" toast (Windows notification).
- [ ] Tray icon with Exit.
- Acceptance: press hotkey in any app → speak Persian → text lands in clipboard within 1 s of finishing; killing the daemon mid-recording leaves a recoverable temp file.

## Phase 2 — Server: auth, quota, gateway
- [ ] NestJS: email/OTP auth, JWT + refresh for daemon.
- [ ] STT gateway: provider adapter trait (from Phase 0 winners), priority table in Postgres, health-check loop, automatic failover, WebSocket endpoint speaking the internal contract (PCM in, partial/final out).
- [ ] Quota service: Redis counter per user-month, 30-min free tier, "quota exhausted" event pushed on the socket. No audio persisted; logs are metadata-only.
- Acceptance: e2e test — authed client streams audio, gets text, quota decremented; kill primary provider mid-stream in a test, secondary takes over on next request.

## Phase 3 — Full text injector
- [ ] Destination snapshot at recording start: foreground window, focused UIA element, editable?, process name.
- [ ] Strategy 1: UI Automation TextPattern/ValuePattern insert.
- [ ] Strategy 2: SendInput with KEYEVENTF_UNICODE, throttled 200–400 chars/s.
- [ ] Strategy 3: clipboard + Ctrl+V + restore previous clipboard after 300 ms.
- [ ] Silent fallback chain, non-editable snapshot → straight to clipboard mode; closed window → clipboard mode.
- [ ] Request queue: max 1 concurrent injection, FIFO depth 3.
- [ ] Injector behind a trait with a mock impl; unit-test the strategy selection matrix.
- Acceptance: manual checklist passes in Word, Telegram Desktop, Chrome address bar + textarea, VS Code, Notepad — Persian with half-spaces intact.

## Phase 4 — Overlay & body language
- [ ] Layered click-through window (WS_EX_LAYERED | TRANSPARENT | TOOLWINDOW), 36 px circle following cursor at fixed offset, 30 fps only while active, DPI-aware.
- [ ] States: blue pulse (listening), amber spin (processing), green 500 ms (done), red + one-line message (error, exceptionally clickable).
- [ ] Alternative corner-widget mode; setting to choose. Push-to-talk via WH_KEYBOARD_LL.
- Acceptance: overlay never steals focus or clicks; states match the error matrix in spec §9.

## Phase 5 — Local engine & router
- [ ] whisper-rs integration; model manager (download "light"/"accurate" from Studio, checksum, lazy load, unload after 5 min idle).
- [ ] Engine router decision table from spec §3.4 incl. deferred queue (transcribe later → history + notification, no auto-insert).
- [ ] Mid-stream connection loss: keep recording from disk buffer, run whole file through local engine, discard partial cloud text.
- Acceptance: airplane-mode test — dictation still works with local model; without model, audio is queued and transcribed on reconnect.

## Phase 6 — Studio
- [ ] Tauri app, Named Pipe protocol to daemon (get/set settings, history, test-mic, download-model, login, usage).
- [ ] 30-second onboarding: pick hotkey (conflict → suggest alternative) → live test → engine mode. Guest mode = local-only, no account.
- [ ] Settings page per approved mockups: hotkey, engine mode cards, insertion checkboxes, blacklist chips, quota bar + upgrade button.
- [ ] History view (last 10, copy/delete), "delete all data" button.
- [ ] RTL-first, fa/en i18n file.
- Acceptance: fresh install → productive dictation in under 60 s without docs.

## Phase 7 — Persian rules & hardening
- [ ] Deterministic Persian pipeline (spec §6): char normalization, half-space joins with exception list, spoken punctuation (fa+en command list), minimal correction commands on the pre-insert buffer, digit policy. Each rule individually toggleable; full unit-test suite.
- [ ] Performance harness in CI asserting spec §8 budgets (RAM, latencies, installer size).
- [ ] Watchdog task (auto-restart daemon), silent updater (stable/beta), remote config fetch (quota, RTL-problem app list, provider priorities, feature flags).
- [ ] Code-signing step documented in release pipeline.
- Acceptance: all §8 budget tests green; recovery test: crash daemon mid-recording → after restart, audio recovered to history.
