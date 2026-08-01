# Plan 003: Add Unit and Integration Tests for STT WebSocket Gateway

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fcd765f..HEAD -- zero-server/src/stt/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `fcd765f`, 2026-07-30

## Why this matters

The `SttGateway` in `zero-server/src/stt/stt.gateway.ts` handles WebSocket client authentication, token parsing, monthly quota checks, audio PCM buffering, and transcription invocation. Currently, there are ZERO tests for `SttGateway`. Adding a suite of unit and integration tests ensures that authentication failures, quota exhaustion, binary audio stream buffer limits (5 minutes max), and graceful socket disconnection are verified automatically.

## Current state

In [`zero-server/src/stt/stt.gateway.ts:24-95`](file:///d:/zero-project/zero-server/src/stt/stt.gateway.ts#L24-L95):

```typescript
@WebSocketGateway({
  path: '/stt',
})
export class SttGateway implements OnGatewayConnection, OnGatewayDisconnect {
  // Connection handling, auth token parsing, quota check, binary streaming
}
```

Existing test exemplars:
- [`zero-server/src/auth/auth.service.spec.ts`](file:///d:/zero-project/zero-server/src/auth/auth.service.spec.ts)
- [`zero-server/src/quota/quota.service.spec.ts`](file:///d:/zero-project/zero-server/src/quota/quota.service.spec.ts)
- [`zero-server/src/stt/stt.service.spec.ts`](file:///d:/zero-project/zero-server/src/stt/stt.service.spec.ts)

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Build     | `npm --prefix zero-server run build` | exit 0              |
| Tests     | `npm --prefix zero-server run test`  | all pass            |

## Scope

**In scope**:
- `zero-server/src/stt/stt.gateway.spec.ts` (NEW)

**Out of scope**:
- `zero-server/src/stt/stt.service.ts`

## Git workflow

- Branch: `advisor/003-stt-websocket-gateway-tests`
- Commit message: `test(server): add unit and integration test suite for SttGateway`

## Steps

### Step 1: Create `zero-server/src/stt/stt.gateway.spec.ts`

Model the test suite using NestJS `Test.createTestingModule`:
- Mock `JwtService`, `QuotaService`, `SttService`.
- Test cases:
  1. Connection rejection when no token is provided (close code 4001).
  2. Connection rejection when token is invalid or expired (close code 4002).
  3. Connection rejection when user has 0 quota remaining (close code 4003).
  4. Successful authentication & session setup when token & quota are valid.
  5. Receiving binary audio data without `start` message.
  6. Enforcing 5-minute maximum PCM buffer size limit (close code 4004).
  7. Successful `start` → `binary audio` → `stop` → transcription & quota deduction pipeline.

**Verify**: `npm --prefix zero-server run test` → all 5+ test suites pass

## Done criteria

- [ ] `zero-server/src/stt/stt.gateway.spec.ts` created and passing
- [ ] `npm --prefix zero-server run test` exits 0 with 5 total test suites passed
- [ ] `plans/README.md` status row updated

## STOP conditions

- If `ws` mock requires specialized setup, use Jest mock functions (`jest.fn()`) for WebSocket instances.
