# Plan 004: Cache User Subscription Tier in QuotaService to Prevent Database Roundtrips

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fcd765f..HEAD -- zero-server/src/quota/quota.service.ts`
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

In `zero-server/src/quota/quota.service.ts`, `getLimit(userId)` queries `this.prisma.user.findUnique({ where: { id: userId } })` on every WebSocket connection attempt and quota check. This creates an unneeded PostgreSQL query roundtrip per audio stream handshake. Caching user subscription limits in Redis or in-memory LRU cache (or reading subscription tier directly from the validated JWT payload) eliminates this DB bottleneck entirely.

## Current state

In [`zero-server/src/quota/quota.service.ts:56-68`](file:///d:/zero-project/zero-server/src/quota/quota.service.ts#L56-L68):

```typescript
async getLimit(userId: string): Promise<number> {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
  });

  if (user && user.subscription === 'smart') {
    return 86400; 
  }

  return this.settingsService.getSettingValue<number>('quota.free.monthly_limit_sec', 1800);
}
```

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Build     | `npm --prefix zero-server run build` | exit 0              |
| Tests     | `npm --prefix zero-server run test`  | all pass            |

## Scope

**In scope**:
- `zero-server/src/quota/quota.service.ts`
- `zero-server/src/quota/quota.service.spec.ts`

**Out of scope**:
- `zero-server/src/auth/`

## Git workflow

- Branch: `advisor/004-quota-subscription-caching`
- Commit message: `perf(server): cache user subscription quota limit to prevent database query on every websocket connection`

## Steps

### Step 1: Add Redis/In-Memory TTL caching for user subscription limit

In `quota.service.ts`, update `getLimit`:
1. Check Redis key `user:sub:${userId}` (TTL 5 minutes).
2. If cache miss, query `prisma.user.findUnique`, cache the result in Redis with a 5-minute TTL, and return.
3. If Redis is unavailable, fall back to an in-memory TTL Map (`Map<string, { value: number; expiresAt: number }>`).

**Verify**: `npm --prefix zero-server run test` → all tests pass

### Step 2: Update `quota.service.spec.ts` to test caching behavior

Verify that subsequent calls to `getLimit` for the same user within TTL do not re-query Prisma.

**Verify**: `npm --prefix zero-server run test` → all tests pass

## Done criteria

- [ ] `npm --prefix zero-server run build` exits 0
- [ ] `npm --prefix zero-server run test` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- If Redis caching pattern differs from existing Redis key schema in `quota.service.ts`, keep key format consistent with `user:sub:{userId}`.
