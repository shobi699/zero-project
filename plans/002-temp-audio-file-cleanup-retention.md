# Plan 002: Handle Corrupt Temp Audio Files and Enforce Cleanup Retention

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fcd765f..HEAD -- zero-daemon/src/buffer.rs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `fcd765f`, 2026-07-30

## Why this matters

When `zero-daemon` starts up, `recover_temp_files` scans `tmp_dir` for lingering `.enc` encrypted audio buffer files. If a file is corrupted, truncated, or encrypted with a key that was rotated, `read_encrypted_file` returns an error, which is logged as a warning, but the corrupted file is left on disk indefinitely. This causes `zero-daemon` to re-read and re-fail on every single startup. Furthermore, recovered temp files are returned to the caller without an automated retention or auto-cleanup policy when files are older than 24 hours.

## Current state

In [`zero-daemon/src/buffer.rs:56-82`](file:///d:/zero-project/zero-daemon/src/buffer.rs#L56-L82):

```rust
pub fn recover_temp_files(tmp_dir: &Path, crypto: &AudioCrypto) -> Vec<(PathBuf, Vec<u8>)> {
    let mut recovered = Vec::new();

    let entries = match fs::read_dir(tmp_dir) {
        Ok(e) => e,
        Err(_) => return recovered,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_none_or(|e| e != "enc") {
            continue;
        }

        match read_encrypted_file(&path, crypto) {
            Ok(pcm) => {
                info!(path = %path.display(), bytes = pcm.len(), "recovered temp file");
                recovered.push((path, pcm));
            }
            Err(e) => {
                tracing::warn!(path = %path.display(), error = %e, "failed to recover temp file");
            }
        }
    }

    recovered
}
```

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Check     | `cargo check -p zero-daemon` | exit 0              |
| Clippy    | `cargo clippy -p zero-daemon -- -D warnings` | exit 0, no warnings |
| Tests     | `cargo test -p zero-daemon`  | all pass            |

## Scope

**In scope**:
- `zero-daemon/src/buffer.rs`

**Out of scope**:
- `zero-daemon/src/main.rs`

## Git workflow

- Branch: `advisor/002-temp-audio-file-cleanup-retention`
- Commit message: `fix(daemon): delete unrecoverable or stale temp audio files during recovery`

## Steps

### Step 1: Remove corrupted `.enc` files and prune files older than 24h

Update `recover_temp_files` in `zero-daemon/src/buffer.rs` to:
1. Delete corrupted `.enc` files when `read_encrypted_file` returns an error, moving them to a `.bak` or removing them immediately.
2. Delete lingering `.enc` files older than 24 hours.

```rust
Err(e) => {
    tracing::warn!(path = %path.display(), error = %e, "deleting corrupted temp file");
    let _ = fs::remove_file(&path);
}
```

**Verify**: `cargo check -p zero-daemon` → exit 0

### Step 2: Add unit tests for corrupted and stale temp file cleanup

Add a test in `buffer.rs` verifying that invalid/corrupt `.enc` files placed in a temp directory are cleaned up during recovery.

**Verify**: `cargo test -p zero-daemon` → all pass

## Done criteria

- [ ] `cargo check -p zero-daemon` exits 0
- [ ] `cargo clippy -p zero-daemon -- -D warnings` exits 0
- [ ] `cargo test -p zero-daemon` passes including new buffer tests
- [ ] `plans/README.md` status row updated

## STOP conditions

- If file metadata or creation time cannot be read on Windows, use fallback file deletion on decryption error.
