# Plan 005: Add DX Scripts and Monorepo Typecheck & Test Verifier

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fcd765f..HEAD -- zero-studio/package.json package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `fcd765f`, 2026-07-30

## Why this matters

Currently, running `npm --prefix zero-studio run typecheck` fails because `typecheck` is missing from `zero-studio/package.json`. Furthermore, there is no single root command to run all tests and typechecks across the Rust workspace, NestJS server, and React studio. Adding standard `typecheck` scripts to `zero-studio/package.json` and root package scripts enables fast feedback loops and CI verification.

## Current state

In [`zero-studio/package.json:6-10`](file:///d:/zero-project/zero-studio/package.json#L6-L10):

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "tauri": "tauri"
}
```

TypeScript is installed in devDependencies (`typescript` package or via `tsc`).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `npm --prefix zero-studio install -D typescript` | typescript added to devDependencies |
| Typecheck | `npm --prefix zero-studio run typecheck`         | exit 0, no errors                   |
| Build     | `npm --prefix zero-studio run build`             | exit 0                              |

## Scope

**In scope**:
- `zero-studio/package.json`
- `package.json` (root)

**Out of scope**:
- Rust crate `Cargo.toml`

## Git workflow

- Branch: `advisor/005-monorepo-dx-scripts-typecheck`
- Commit message: `dx: add typecheck script to studio and root test verifier scripts`

## Steps

### Step 1: Add `typescript` devDependency and `typecheck` script to `zero-studio/package.json`

Add `"typecheck": "tsc --noEmit"` to `zero-studio/package.json` scripts and ensure `typescript` is in `devDependencies`.

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "typecheck": "tsc --noEmit",
  "tauri": "tauri"
}
```

**Verify**: `npm --prefix zero-studio run typecheck` → exit 0 with 0 errors

### Step 2: Add root `package.json` scripts for whole monorepo verification

Add root npm scripts:
- `"test": "cargo test --workspace && npm --prefix zero-server run test"`
- `"typecheck": "cargo clippy --workspace -- -D warnings && npm --prefix zero-server run build && npm --prefix zero-studio run typecheck"`

**Verify**: `npm run typecheck` → exit 0

## Done criteria

- [ ] `npm --prefix zero-studio run typecheck` exits 0
- [ ] `npm run typecheck` exits 0 across monorepo
- [ ] `plans/README.md` status row updated

## STOP conditions

- If `tsc --noEmit` reports pre-existing type errors in `zero-studio`, fix ambient/import type definitions in `src/` to achieve 0 type errors.
