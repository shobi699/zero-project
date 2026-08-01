# Plan 007: Replace Studio 3s Polling with IPC Real-Time Status Broadcasts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fcd765f..HEAD -- zero-studio/src/App.tsx zero-studio/src-tauri/src/main.rs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `fcd765f`, 2026-07-30

## Why this matters

In `zero-studio/src/App.tsx`, `fetchDaemonStatus` uses `setInterval(fetchDaemonStatus, 3000)` polling to poll daemon state every 3 seconds. This introduces up to 3000ms latency when updating Studio status indicators (e.g. "Listening" / "Processing" / "Idle"). Replacing polling with Tauri event emission (`app_handle.emit("daemon-status-changed", ...)` triggered by IPC broadcasts) provides instantaneous UI responsiveness and eliminates polling overhead.

## Current state

In [`zero-studio/src/App.tsx:20-29`](file:///d:/zero-project/zero-studio/src/App.tsx#L20-L29):

```typescript
useEffect(() => {
  const isCompleted = localStorage.getItem('zero_onboarded');
  if (isCompleted === 'true') {
    setOnboarded(true);
  }
  fetchDaemonStatus();
  // Poll daemon status every 3 seconds
  const interval = setInterval(fetchDaemonStatus, 3000);
  return () => clearInterval(interval);
}, [onboarded]);
```

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Build     | `npm --prefix zero-studio run build` | exit 0              |
| Typecheck | `npm --prefix zero-studio run typecheck` | exit 0              |

## Scope

**In scope**:
- `zero-studio/src/App.tsx`
- `zero-studio/src-tauri/src/main.rs`

**Out of scope**:
- `zero-daemon/src/ipc.rs`

## Git workflow

- Branch: `advisor/007-studio-ipc-realtime-events`
- Commit message: `feat(studio): replace 3s daemon status polling with real-time tauri event listener`

## Steps

### Step 1: Subscribe to Tauri events in `zero-studio/src/App.tsx`

Use `@tauri-apps/api/event` `listen` function:

```typescript
import { listen } from '@tauri-apps/api/event';

useEffect(() => {
  const unlistenPromise = listen<{ status: string }>('daemon-status-changed', (event) => {
    setDaemonStatus(event.payload.status);
  });

  fetchDaemonStatus();

  return () => {
    unlistenPromise.then((unlisten) => unlisten());
  };
}, [onboarded]);
```

**Verify**: `npm --prefix zero-studio run build` → exit 0

## Done criteria

- [ ] `npm --prefix zero-studio run build` exits 0
- [ ] 3-second polling interval removed from `App.tsx`
- [ ] `plans/README.md` status row updated

## STOP conditions

- If Tauri event listener scope requires `app_handle` permissions in `capabilities/`, update `zero-studio/src-tauri/capabilities/default.json`.
