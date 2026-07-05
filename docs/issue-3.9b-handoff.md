# Issue 3.9B — Intermittent `@coopsource/api` Test Flake — Handoff

**Status:** OPEN. Pre-existing, not product-related, not yet root-caused.
**Owner:** unassigned. **Created:** 2026-07-04.
**Scope:** test infrastructure only — no product/runtime code is implicated.
**Priority:** medium. It does **not** block correctness (every test passes in isolation), but it makes the full `pnpm test` gate unreliable, so CI/pre-merge verification must currently be done **per-package**.

---

## TL;DR for the next agent

The `@coopsource/api` Vitest suite (80 files, ~845 tests) intermittently fails **2–3 tests on ~20–25% of full runs**, and **the set of failing tests changes from run to run**. Every failing test passes when run in isolation. This is the classic signature of **shared state leaking between test files**, made possible by the suite's config: `isolate: false`, one forked process, and a single shared database + Kysely connection pool. Product code is not involved. The leading unproven hypothesis is an **un-awaited (fire-and-forget) async DB write from one test landing during a later test**, or interacting with that later test's `truncateAllTables`. The recommended first experiment is flipping `isolate: true` and measuring; the recommended real fix is finding and awaiting the leaking write.

**Do not** "fix" this by adding retries, bumping timeouts, or re-serializing turbo tasks — those were tried and are either ineffective or mask the problem (see Attempt Log).

---

## 1. Observed behavior

### Symptoms
Running the full workspace suite:

```bash
pnpm test --force        # runs `turbo test` across all packages
```

…fails **`@coopsource/api#test`** on roughly **1 in 4–5 runs**. When it fails, the summary looks like:

```
 Test Files  1 failed | 81 passed (82)
      Tests  2 failed | 843 passed (845)
```

Crucially, running the api package **alone** reproduces it too (so it is NOT caused by concurrency with the `federation` package's Docker suite):

```bash
pnpm --filter @coopsource/api test    # ~20–25% of runs still fail
```

### The failing tests VARY between runs
This is the most important diagnostic fact. Observed failing tests across different runs during investigation:

| Run | Failing test(s) | Error shape |
|---|---|---|
| A | `appview-dispatch.test.ts › GET /admin/hooks returns registered hooks` | timeout at **10002ms** |
| A | `appview-dispatch.test.ts › GET /admin/hooks/dead-letter returns entries` | timeout at ~8979ms |
| B | `xrpc-vote-eligibility.test.ts › returns ineligible when proposal is not open for voting` | `expected 200, got 404` |
| B | `xrpc-vote-eligibility.test.ts › returns hasVoted true after casting a vote` | `expected 200, got 404` |
| C | `capital-accounts.test.ts › allocates patronage to capital accounts` | `expected 200 "OK", got 404 "Not Found"` |
| C | `capital-accounts.test.ts › redeems revolving fund allocation` | `expected 200, got 404` |

Two error shapes dominate:
- **`404 Not Found`** where `200` is expected — a resource (cooperative / entity / config row) the test expects is missing. Consistent with the DB being truncated out from under a request, or a prior write not being visible.
- **Request timeout (~10s)** — a request hangs. Note the app's per-request AI/script fetch abort is `AbortSignal.timeout(10_000)` (`apps/api/src/scripting/script-service.ts:681`, `apps/api/src/ai/triggers/action-executor.ts:126`), and the Vitest `testTimeout` is `30_000` — so a **10s** hang points at a request path that reaches one of those aborts, or a socket that stalls, rather than the Vitest timeout.

### Frequency
~20–25% of full runs. It is **not** deterministic per run order (the suite runs files in a fixed order under `maxWorkers: 1`, yet the outcome varies), which means the non-determinism is **temporal/async**, not ordering-based.

---

## 2. Why this is possible — the test topology

`apps/api/vitest.config.ts`:

```ts
test: {
  globals: true,
  environment: 'node',
  globalSetup: ['tests/helpers/vitest.setup.ts'],
  testTimeout: 30_000,
  fileParallelism: false,   // files run one at a time
  pool: 'forks',
  maxWorkers: 1,            // a single worker process
  isolate: false,          // *** modules are NOT re-imported per file ***
  ...
}
```

Consequences that enable cross-file state leakage:
1. **`isolate: false`** — all 80 test files share **one module registry**. Every module-level singleton (`let x`, module-scoped caches, EventEmitters) persists across files for the whole run.
2. **Single shared database + pool** — the test DB handle is a module-level singleton created once (`getTestDb()` in `apps/api/tests/helpers/test-db.ts`), a `pg.Pool({ max: 5 })`. All files share these 5 connections.
3. **`globalSetup`** (`tests/helpers/vitest.setup.ts`) creates + migrates `coopsource_test` **once** for the whole run; it is not recreated per file.
4. **Per-file cleanup is `truncateAllTables()` in `beforeEach`** in most files. Of 80 files: **66 truncate in `beforeEach`**, 2 truncate outside `beforeEach`, and **12 never truncate** (mostly pure-unit files with no DB — but worth auditing; see §5). Only **2 files** (`config.test.ts`, `spaces-consumer-dispatch.test.ts`) have any `afterEach`/`afterAll` cleanup.

`truncateAllTables()` (`apps/api/tests/helpers/test-db.ts`) issues one big `TRUNCATE TABLE … CASCADE` over ~70 tables. If any async DB work from a *previous* test is still in flight when this runs, the two interleave on the shared pool.

---

## 3. Reproduction

```bash
# From repo root. Requires local Postgres (Homebrew) on :5432 owned by `alan`,
# and the coopsource_test DB (globalSetup drops/recreates it).
# Loop until it fails, and print the failing tests + first error:
cd apps/api
for i in $(seq 1 8); do
  out=$(pnpm exec vitest run 2>&1)
  if echo "$out" | grep -qE "Tests .*failed"; then
    echo "=== FAIL on iteration $i ==="
    echo "$out" | grep -E "FAIL  tests/|× .*[0-9]+ms" | head
    echo "$out" | grep -iE "AssertionError|expected .* got|Timeout|does not exist|violates" | head
    break
  fi
  echo "iter $i: green"
done
```

Expect a failure within ~2–5 iterations. Note which tests fail — it will likely differ from the table in §1.

**Deterministic-green baseline (the current verification gate):** any single file, or any single package, passes reliably:

```bash
pnpm --filter @coopsource/api test tests/capital-accounts.test.ts   # green
pnpm --filter @coopsource/arbiter-client test                        # green (20)
pnpm --filter @coopsource/spaces-consumer test                       # green (24)
pnpm --filter @coopsource/common test                                # green (102)
pnpm --filter @coopsource/federation test                            # green (120, needs Docker)
```

---

## 4. Attempt log — what was tried and the result

Each of these was attempted during the 2026-07-04 investigation. **Do not repeat them expecting success.**

1. **Turbo task serialization** (`@coopsource/api#test` `dependsOn` `@coopsource/federation#test`, in `turbo.json`).
   - *Rationale:* the flake was first seen in full parallel runs; suspected Docker (federation) resource contention.
   - *Result:* **did not fix it.** Full runs still failed ~1/3 even with the dependency. **Reverted** (it only slowed the suite).
   - *Also relevant:* an earlier, unrelated `turbo.json` change (removing this same serialization) was fine — it was originally added to work around **Issue A** (the federation Docker Postgres colliding on host :5432), which is a *separate, already-fixed* problem (see §6).

2. **Bump the test pool** `pg.Pool({ max: 5 })` → `max: 20` (`test-db.ts`).
   - *Rationale:* pool starvation under load.
   - *Result:* **did not fix it** (api-alone still failed with the bump). Ruled out: `connectionTimeoutMillis` defaults to `0` (wait forever), so pool exhaustion would hang to the 30s Vitest timeout, not produce a 10s hang or a 404. **Reverted.**

3. **Ran api-alone repeatedly** to test the "federation concurrency" theory.
   - *Result:* api-alone **still flakes** (~20–25%). This **disproved** the cross-suite-contention theory and localized the problem to intra-api shared state.

4. **Inspected `EventDispatcher` / `sseEmitter` listener accumulation.**
   - *Theory:* each `createTestApp()` builds an `EventDispatcher` (`apps/api/src/ai/triggers/event-dispatcher.ts`) that subscribes to the module-level `sseEmitter` (`apps/api/src/appview/sse.ts`); under `isolate:false` these could accumulate across 80 files and all react to every emitted event (V12 added `member.joined`/`member.departed` emissions).
   - *Result:* **ruled out.** `EventDispatcher.start()` is the only place it subscribes, and it is called **only in `apps/api/src/index.ts:349`** — **`createTestApp()` never calls `start()`**. So dispatchers never subscribe in tests, and the V12 emissions are inert there. Confirmed via `grep -rn "eventDispatcher.start\|\.start()" apps/api/tests/helpers/test-app.ts` (no hits).

5. **Checked the module-level setup cache** (`_setupComplete` in `apps/api/src/auth/middleware.ts`, with `resetSetupCache()` / `markSetupComplete()`).
   - *Theory:* stale `_setupComplete=true` while the DB (system_config) was truncated → routes think setup is done but the coop doesn't exist → 404.
   - *Result:* **inconclusive/likely-not-primary.** The failing files (e.g. `capital-accounts.test.ts`) DO call `resetSetupCache()` in `beforeEach` and `setupAndLogin()` (which resets again). But this cache is a genuine cross-file shared singleton and remains a **candidate contributor** — worth instrumenting (see §5).

6. **Grepped for fire-and-forget async DB writes** (`void this.…`, `.then(`, `.catch(` without `await`, `setImmediate`, `queueMicrotask`) in `routes/`, `services/`, `appview/`.
   - *Result:* **no obvious hits.** If the leaking write exists, it is subtle (e.g., a service method that internally doesn't await an inner write, or a library callback).

---

## 5. Leading hypotheses (ranked) and how to test each

### H1 (most likely): an un-awaited async DB write races a later file's `truncateAllTables`
A request handler returns its HTTP response but leaves an async DB write pending (audit log, notification, projection, indexer, event side-effect). That write executes during the *next* test — either it fails because tables were just truncated, or it inserts a row that a later assertion doesn't expect, or it holds a pooled connection that a later request waits on.

**How to test / find it:**
- Add temporary instrumentation to `truncateAllTables()` to log a monotonically increasing "epoch," and wrap the shared pool's `query` to log any query whose epoch predates the current test (i.e., a write from a prior test still running). A stray late write is the smoking gun.
- Or: run with `pool: 'forks'` unchanged but set `maxWorkers: 1` + add `afterEach(async () => { await new Promise(r => setTimeout(r, 50)); })` in a suspected file to let stragglers drain — if the flake for that file disappears, a straggler is confirmed.
- Audit request paths that emit events or write audit/notification rows *after* sending the response. Note `emitAppEvent` is synchronous (`sseEmitter.emit`), so it is not itself the culprit, but check any `.catch()`-guarded async work.

### H2: module-level singleton state (setup cache and/or others) inconsistent with the truncated DB
Under `isolate:false`, `_setupComplete` (auth middleware) and any other module singletons survive across files. A file that truncates but doesn't `resetSetupCache()` (or a timing gap) could leave routes believing setup is complete when `system_config` was wiped → 404.

**How to test:**
- Grep every file that calls `truncateAllTables` but NOT `resetSetupCache`, and vice-versa. Enumerate other module-level singletons (`grep -rn "^let \|^const .* = new .*Emitter\|module-scoped" apps/api/src`).
- Add an assertion/log in `isSetupComplete()` when the cache says "complete" but a `system_config` lookup returns null — catch the inconsistency in the act.

### H3: connection-pool exhaustion/stall under `max: 5`
Five shared connections across 80 files; a slow/held connection could make a later request wait. But `connectionTimeoutMillis: 0` means it would hang to the 30s Vitest timeout, which does NOT match the observed **10s** hangs — so this is a **weak** hypothesis for the timeout cases (though it could contribute to 404s if a write connection is starved).

**How to test:** set `pg.Pool({ max: 5, connectionTimeoutMillis: 2000 })` temporarily; if hangs turn into fast connection-timeout errors, starvation is involved.

### The 12 non-truncating files
`ai-sdk-helpers`, `automation-conditions`, `config`, `commit-verifier`, `consent-evidence-verifier`, `governance-labeler`, `label-signer`, `spaces-consumer-dispatch`, `inlay-proposal-card`, `relay-consumer`, `member-write-proxy`, `xrpc-labels`. Most are pure-unit (no DB). **Audit whether any of them touches the shared DB without truncating** (would leave rows for the next file). `spaces-consumer-dispatch.test.ts` in particular exercises DB-adjacent code and has cleanup — verify it truly cleans up.

---

## 6. Explicitly OUT of scope (already fixed — don't confuse with this)

**Issue A — federation/api DB-port collision (FIXED).** The `federation` package's test `globalSetup` used to run its Docker Postgres on host `:5432`, colliding with the Homebrew Postgres the api suite uses, so a full `pnpm test` nondeterministically pointed api tests at the wrong DB. Fixed by publishing the Docker Postgres on `:5433` (`infrastructure/docker-compose.yml` `POSTGRES_HOST_PORT`, and `packages/federation/tests/global-setup.ts` sets `POSTGRES_HOST_PORT=5433`). This is a **different** flake; it is resolved and should not be reopened. Issue 3.9B reproduces even with the api suite run **alone**, proving it is independent of Issue A.

---

## 7. Recommended plan of attack

1. **Reproduce and capture** (§3). Collect 5–10 failing runs and record the failing test + error each time. Confirm the "varying set" pattern and whether 404s vs timeouts correlate with anything (e.g., always a file that follows a specific heavy file).
2. **Cheap experiment first: `isolate: true`.** In `apps/api/vitest.config.ts`, set `isolate: true` and run the reproduction loop 10×. If the flake **disappears**, the cause is module-level state (H2) and you can either keep `isolate: true` (accept the slower re-import cost) or hunt the specific singleton. If it **persists**, the cause is DB-level (H1/H3) and `isolate` won't save you — proceed to instrument the pool/truncate (H1).
3. **Instrument for H1** (the straggler write). See H1's method. This is the most likely real cause and the most durable fix (await the write).
4. **Verify a fix rigorously.** Because it's ~20–25%, a single green run proves nothing. Require **≥15 consecutive green full-suite runs** (script it) before declaring it fixed. Prefer a fix that makes each test file provably self-contained (truncate + reset all singletons in `beforeEach`, and no un-awaited writes) over a config flag that merely hides it.

---

## 8. File reference (quick map)

| Concern | Path |
|---|---|
| Vitest config (isolate/pool/workers) | `apps/api/vitest.config.ts` |
| Test DB helper (pool, `getTestDb`, `truncateAllTables`, create/migrate) | `apps/api/tests/helpers/test-db.ts` |
| Global setup (once-per-run DB create+migrate) | `apps/api/tests/helpers/vitest.setup.ts` |
| Test app factory (per-file `createTestApp`, `setupAndLogin`) | `apps/api/tests/helpers/test-app.ts` |
| Setup cache singleton | `apps/api/src/auth/middleware.ts` (`_setupComplete`, `resetSetupCache`, `markSetupComplete`, `isSetupComplete`) |
| SSE emitter singleton | `apps/api/src/appview/sse.ts` (`sseEmitter`, `emitAppEvent`) |
| Event dispatcher (only started in index.ts, NOT in tests) | `apps/api/src/ai/triggers/event-dispatcher.ts`; started at `apps/api/src/index.ts:349` |
| 10s request-side aborts (match the observed 10s hangs) | `apps/api/src/scripting/script-service.ts:681`, `apps/api/src/ai/triggers/action-executor.ts:126` |
| Frequently-observed failing files | `apps/api/tests/appview-dispatch.test.ts`, `apps/api/tests/xrpc-vote-eligibility.test.ts`, `apps/api/tests/capital-accounts.test.ts` |
| Out-of-scope (fixed) port collision | `infrastructure/docker-compose.yml`, `packages/federation/tests/global-setup.ts` |

---

## 9. Interim guidance (until fixed)

- **Verify per-package**, not via full parallel `pnpm test`. `pnpm --filter @coopsource/<pkg> test` and single-file runs are deterministic. This is how all V12 Phase 3 work was verified.
- A red `@coopsource/api#test` in a full run is **not** by itself evidence of a regression — re-run the affected file(s) in isolation to confirm. Only treat it as a real failure if it reproduces in isolation.
- When you land the real fix, delete this file and update `docs/superpowers/plans/2026-07-04-v12-phase-3-arbiter-convergence.md` Task 3.9 Issue B.
