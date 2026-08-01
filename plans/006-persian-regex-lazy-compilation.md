# Plan 006: Optimize Persian Text Normalization via Lazy Static Regexes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fcd765f..HEAD -- zero-daemon/src/persian.rs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `fcd765f`, 2026-07-30

## Why this matters

In `zero-daemon/src/persian.rs`, `normalize_persian_text` performs consecutive string allocations and pattern matches (`.replace()` and `.replacen()`) on every single transcribed speech chunk. Using `std::sync::LazyLock` static regexes (supported natively in Rust 1.80+) optimizes pattern matching, reduces heap allocations during real-time speech processing, and enforces zero-cost static regex compilation.

## Current state

In [`zero-daemon/src/persian.rs:1-51`](file:///d:/zero-project/zero-daemon/src/persian.rs#L1-L51):

```rust
pub fn normalize_persian_text(text: &str) -> String {
    let mut normalized = text.to_string();

    normalized = normalized.replace('ي', "ی");
    normalized = normalized.replace('ك', "ک");

    normalized = normalized.replace(" علامت سوال", "؟");
    normalized = normalized.replace(" علامت تعجب", "!");
    normalized = normalized.replace(" ویرگول", "،");
    normalized = normalized.replace(" دونقطه", ":");
    normalized = normalized.replace(" دو نقطه", ":");
    normalized = normalized.replace(" نقطه", ".");
    // ...
}
```

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Check     | `cargo check -p zero-daemon` | exit 0              |
| Clippy    | `cargo clippy -p zero-daemon -- -D warnings` | exit 0, no warnings |
| Tests     | `cargo test -p zero-daemon persian` | all 10 tests pass   |

## Scope

**In scope**:
- `zero-daemon/src/persian.rs`

**Out of scope**:
- `zero-daemon/src/injector.rs`

## Git workflow

- Branch: `advisor/006-persian-regex-lazy-compilation`
- Commit message: `perf(daemon): optimize persian text normalization with static regex rules`

## Steps

### Step 1: Use `std::sync::LazyLock` for static regex patterns

In `zero-daemon/src/persian.rs`, compile regexes once at startup:

```rust
use std::sync::LazyLock;
use regex::Regex;

static RE_ARABIC_YEH_KAF: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[يك]").unwrap());
static RE_PUNCTUATION_QUESTION: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+علامت سوال").unwrap());
```

**Verify**: `cargo check -p zero-daemon` → exit 0

### Step 2: Ensure all unit tests in `persian::tests` pass

Run test suite to verify Persian text normalization, half-spacing, voice commands, and dictionary replacement behavior.

**Verify**: `cargo test -p zero-daemon persian` → 10 passed

## Done criteria

- [ ] `cargo check -p zero-daemon` exits 0
- [ ] `cargo clippy -p zero-daemon -- -D warnings` exits 0
- [ ] `cargo test -p zero-daemon persian` passes all tests
- [ ] `plans/README.md` status row updated

## STOP conditions

- If `regex` crate is missing from `zero-daemon/Cargo.toml`, add `regex = "1.10"` to `Cargo.toml`.
