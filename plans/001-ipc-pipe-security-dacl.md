# Plan 001: Enforce Security DACL Attributes on Named Pipe Server

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fcd765f..HEAD -- zero-daemon/src/ipc.rs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `fcd765f`, 2026-07-30

## Why this matters

The Named Pipe server in `zero-daemon/src/ipc.rs` currently initializes `ServerOptions::new().create(pipe_name)` without specifying a security descriptor. On Windows, default named pipe creation grants `EVERYONE` read/write access to the pipe. Any unprivileged process running locally on the system can connect to `\\.\pipe\zero-ipc` and invoke administrative or destructive commands like `DeleteAllData`, `AddBlacklist`, `SetConfig`, or `UpdateSettings`. Adding explicit Security Attributes restricting connection rights to the current user SID ensures local process isolation.

## Current state

In [`zero-daemon/src/ipc.rs:114-127`](file:///d:/zero-project/zero-daemon/src/ipc.rs#L114-L127):

```rust
let server = match ServerOptions::new()
    .first_pipe_instance(is_first)
    .create(pipe_name)
{
    Ok(s) => {
        is_first = false;
        s
    }
    Err(e) => {
        error!("Failed to create named pipe instance: {}", e);
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        continue;
    }
};
```

`ServerOptions` from `tokio::net::windows::named_pipe` provides `.reject_remote_clients(true)` and supports Windows security descriptors or restricting pipe access.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Check     | `cargo check -p zero-daemon` | exit 0              |
| Clippy    | `cargo clippy -p zero-daemon -- -D warnings` | exit 0, no warnings |
| Tests     | `cargo test -p zero-daemon`  | all pass            |

## Scope

**In scope**:
- `zero-daemon/src/ipc.rs`

**Out of scope**:
- `zero-daemon/src/main.rs`
- Client code in `zero-studio`

## Git workflow

- Branch: `advisor/001-ipc-pipe-security-dacl`
- Commit message: `security(daemon): restrict named pipe access to local current user session`

## Steps

### Step 1: Configure `.reject_remote_clients(true)` on `ServerOptions`

In `zero-daemon/src/ipc.rs`, modify `ServerOptions::new()` initialization:

```rust
let server = match ServerOptions::new()
    .first_pipe_instance(is_first)
    .reject_remote_clients(true)
    .create(pipe_name)
{
```

**Verify**: `cargo check -p zero-daemon` → exit 0

### Step 2: Add IPC pipe connection test

Add a unit test in `ipc.rs` testing server creation and client connection under local process boundaries.

**Verify**: `cargo test -p zero-daemon` → all pass

## Done criteria

- [ ] `cargo check -p zero-daemon` exits 0
- [ ] `cargo clippy -p zero-daemon -- -D warnings` exits 0
- [ ] `cargo test -p zero-daemon` passes
- [ ] `plans/README.md` status row updated

## STOP conditions

- If `ServerOptions::reject_remote_clients` is not supported in the installed `tokio` version, stop and report back.

## Maintenance notes

- Ensure any future IPC transport additions (e.g. gRPC or WebSocket) enforce local token or SID authentication.
