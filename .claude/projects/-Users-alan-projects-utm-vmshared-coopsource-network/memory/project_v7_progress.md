---
name: V7 Production Deployment Progress
description: Current state of feature/v7-production-deployment branch — P1-P3 done, consistency fixes pending
type: project
---

## Branch: `feature/v7-production-deployment` (off main)

### Commits on branch (4 + 1 review fix):
1. `294ddab` — ARCHITECTURE-V7.md + update CLAUDE.md/README to reflect V6 completion
2. `476d684` — **P1 done**: Replace custom firehose with Tap + @atproto/tap (deleted relay-consumer.ts, tap-consumer.ts)
3. `1d85774` — **P3 done**: Private network compose (self-hosted PLC, relay, PDS), commit-verifier PLC_URL fix
4. `c140885` — **P2 done**: README PDS setup docs, domain separation warning, private network section
5. `9081ae9` — Review fixes: remove stale AppViewConfig fields, add api→tap depends_on, add init-private-dbs.sql

### Pending: Consistency fixes (small, ready to implement)

Found stale env var references that need cleanup. Plan saved at `/Users/alan/.claude/plans/jiggly-sparking-rabin.md`:

1. **config.ts** (lines 53-56): Remove unused `RELAY_URL` and `VERIFY_COMMIT_SIGNATURES` from Zod schema. Fix TAP_URL comment (says WebSocket, should say HTTP).
2. **.env.example** (lines 107-115): Add `TAP_URL=http://localhost:2480`, remove `VERIFY_COMMIT_SIGNATURES`, mark `RELAY_URL` as legacy.
3. **.env.prod.example** (line 23): Replace `RELAY_URL` with TAP guidance.
4. **README.md** (line 176): Add `TAP_URL` to env vars table, update `RELAY_URL` description.
5. **.env.private.example**: Add `TAP_ADMIN_PASSWORD`.

### Not yet started: P4 (Ozone labeler), P5 (V3 table cleanup)

### Main branch status
Main is 5 commits ahead of origin (unpushed). This branch is based on main.

**Why:** Docker Compose merge behavior means private compose overrides DON'T lose healthchecks/env vars — compose merges at the service key level. Several initial code review findings were false positives.
