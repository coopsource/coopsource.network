# Agent Learnings — hazards, traps, and time-savers

Working notes for whoever picks this repo up next, human or agent. Companions:
[agent-debugging-playbook.md](./agent-debugging-playbook.md) (how to find root
cause) and [agent-testing-practices.md](./agent-testing-practices.md) (how to
write tests that catch these). Everything
here was verified by reading the cited line or by executing it; where a claim is
second-hand it says so. Entries are dated because the codebase moves — **check
the citation before relying on it.**

Add to this file when you lose time to something that was not discoverable from
the code, the docs, or a library's own documentation. Do not add general
programming advice; add the thing that cost you an hour.

---

## 1. Review and verification traps

These are the failure modes that produced the most wasted work in this program.
They are listed first because they are the ones most likely to bite again.

### Guarding one path and missing its sibling

**Five instances in a single session.** Every time, a control was added to one
code path while an equivalent path went unprotected, and the test suite stayed
green because it exercised the guarded one.

| Guarded | Missed |
|---|---|
| granting roles | *removing* roles (strip the owner instead of promoting yourself) |
| `resolveWritePlacement` port logic | the writers that never call the port |
| production container wiring | `tests/helpers/test-app.ts`, which duplicates it |
| `MemberWriteProxy.writeRecord` | `MemberWriteProxy.updateRecord` |
| HTTP role assignment | the federation approval route |

**Practice:** after adding any guard, grep for sibling verbs (`create`/`update`,
`add`/`remove`, `grant`/`revoke`) and sibling call sites, and write the
regression test for *both* before moving on. A guard on one verb is usually not
a fix, because publishing and re-publishing achieve the same thing.

### A green unit test over a port nobody calls

`tier2-placement-containment.test.ts` asserted that the placement port returned
`permissioned-space` for nine confidential collections. It passed for weeks
while two of those collections wrote to public repos, because **no writer called
the port.** The unit was correct and the system was broken.

**Practice:** for any invariant about system behaviour, assert against the
observable end state (here: rows in `pds_record`) through the real route, not
against a helper's return value.

### Tests that pass because the action never happened

A containment test asserted "no public record exists" after a `POST`. It passed
because the campaign was in `draft` and the pledge 400'd — the assertion was
vacuously true. Caught only by printing the status code.

**Practice:** when asserting the *absence* of an effect, first assert the action
reached the code under test (a specific expected status). Otherwise any
unrelated rejection satisfies the test.

### A concurrency pin can pass against broken code and still look convincing

A test that fires N concurrent edits and one approve, then asserts the stored
row matches what the approve returned, is a correct invariant — and it passed
**3/3 against the pre-fix service**, because every racing edit reliably landed
before the approval. Request ordering under `supertest` is stable enough that
"concurrent" does not mean "every interleaving".

**Practice:** measure a concurrency pin's detection rate by running it against
the pre-fix code several times, not once. If it does not fail, either make the
interleave deterministic (see the `transformResult` gate in §2) or delete the
test. The reliable pins in the same file failed 3/3; the decorative one was
removed.

### Verify by executing the attack, not by reading the diff

Every serious defect found in self-review this session was found by running the
exploit through real routes. None were found by re-reading the code, and the
suite was green through all of them.

---

## 2. Test harness

### Each vitest run owns its own database (since 2026-08-02)

`apps/api/tests/helpers/test-db.ts` creates `coopsource_test_<pid>`, resolved
once in the global setup and dropped on teardown.

- `TEST_DATABASE_URL` pins a specific database; one you pin is **never dropped
  for you**. Already a `passThroughEnv` in `turbo.json`.
- `TEST_DB_KEEP=1` preserves the per-run database for post-mortem inspection.
- `TEST_DATABASE_ADMIN_URL` overrides the derived admin connection.

**The trap that cost the most time here:** `globalSetup` runs in the main
process; tests run in **forked workers** (`pool: 'forks'`). A default derived
from `process.pid` inside the worker produces a *different* name than the one
created, and every test fails with `database "coopsource_test_<n>" does not
exist`. The name must be fixed once in setup and inherited through the
environment.

### Failure signature: harness collision vs. product regression

A run failing on **`tax_form_1099_patr`** — the first table in
`truncateAllTables` — means the database vanished underneath it. Suspect the
harness (or a concurrent run), not the product. This previously produced
hundreds of phantom failures that read as mass regressions.

### Keep `truncateAllTables` complete

`apps/api/tests/helpers/test-db.ts` truncates an explicit table list, so a new
table silently leaks rows across test files until someone adds it. `expense`,
`expense_category`, and `revenue_entry` were missing until 2026-08-02. When you
add a table to `packages/db/src/schema.ts`, add it here in the same commit.

### Do not run `CREATE`/`DROP DATABASE` inside the normal suite

Both take heavyweight locks. Tests that created and dropped real databases
mid-run stalled *unrelated* tests to the point of 30-second timeouts — and the
resulting failures pointed at innocent files (`posts.test.ts`), which is close
to undiagnosable if you do not know DDL was running alongside.

If you need to test database-lifecycle logic, split the decision from the
execution and unit-test the decision. `selectOrphanedTestDbs()` is the worked
example: the risk in a sweep is choosing the wrong name, and that is entirely
in the selection, so the selection is pure and tested and the DDL is not
exercised by the suite at all.

### Orphaned per-run databases are reclaimed at setup

`sweepOrphanedTestDbs()` runs before `createTestDb()` and drops
`coopsource_test_<pid>` databases whose owning process is gone (`process.kill(pid, 0)`
throwing `ESRCH`). `EPERM` means the process exists under another user and is
deliberately *not* treated as dead. Without this, killed runs accumulate
databases forever — owning one per run otherwise trades a collision problem for
a litter problem.

### The test container is a second implementation of the real one

`apps/api/tests/helpers/test-app.ts` builds its own container — its own
`pdsService`, its own `AgreementService`, its own everything — rather than
calling `createContainer()`. **A change to `apps/api/src/container.ts` does not
reach the tests.** This is how a production-only guard shipped while the suite
reported it contained.

**Practice:** when you change container wiring, mirror it in `test-app.ts` in
the same commit, or the tests are describing a system that does not exist.

*Update 2026-08-03 (audit N-19):* the literal is now fully typed as `Container`
with no casts, so an unmirrored member is a typecheck failure at
`test-app.ts`, not a silent `undefined`. The duplication itself remains until
`createContainer()` grows override seams.

### The test app is a second router, too — 19 route modules are missing

`apps/api/tests/helpers/test-app.ts` duplicates the container (above) **and**
keeps its own `app.use(...)` list. As of 2026-08-26 nineteen route factories
mounted in `apps/api/src/index.ts` were absent from it, so those HTTP surfaces
had no route-level coverage at all: expenses, revenue, tasks, time tracking,
scheduling, dashboards, reports, mentions, webhooks, MCP, commerce, procurement,
shared resources, connectors, events, collaborative projects, intercoop
agreements, payment webhooks. `POST /api/v1/finance/expenses` returned **404**
inside the test app.

**Practice:** a 404 from the test app is not evidence the route is broken —
check `test-app.ts` mounts it before debugging the route. When adding a route
module to `apps/api/src/index.ts`, mount it in `test-app.ts` in the same
commit. Closing N-19 typed the container; it did not touch the router. Full
list and status: closeout register §3 item 19 (N-26).

### Vitest 4 swallows `console.log` from tests — a silent probe reads as a dead probe

**Measured 2026-08-26.** With this repo's config (`pool: 'forks'`, default
reporter), `console.log()` inside a test prints **nothing**, while
`process.stdout.write()` from the same test prints normally. A probe that
reports its findings through `console.log` therefore produces an empty run that
looks like it never executed.

Three things make the output visible: `--disableConsoleIntercept`,
`--reporter=verbose`, or writing to a file (`appendFileSync`) and `cat`-ing it
afterwards. The file is the most reliable for a probe whose output you intend
to paste into a commit body.

### Kysely's `transformResult` is an async seam for deterministic interleaves

Proving a stale-read defect needs a read held open while a competing write
lands. Racing real requests is unreliable (see §1). Kysely's plugin interface
gives a supported hook: `transformQuery` is synchronous and receives the
operation node, `transformResult` is **`async`** and runs after the query
executes. Tag the query ids you care about in the first and await a barrier in
the second:

```ts
const plugin: KyselyPlugin = {
  transformQuery(args) {
    if (args.node.kind === 'SelectQueryNode') selectQueries.add(args.queryId);
    return args.node;
  },
  async transformResult(args) {
    if (armed && selectQueries.has(args.queryId)) { armed = false; signal(); await released; }
    return args.result;
  },
};
const service = new ExpenseService(db.withPlugin(plugin), clock);
```

The query under test stays the product's own — nothing is reimplemented in the
test, which is the failure mode `tier2-placement-containment.test.ts` fell into.
Worked example: `apps/api/tests/expense-status-cas.test.ts`.

### Vitest 4: setting `exclude` replaces the defaults — including `**/dist/**`

**Verified 2026-08-03 (audit N-20).** Vitest's `exclude` option *replaces* the
default exclude list rather than extending it, and Vitest 4's defaults are only
`**/node_modules/**` and `**/.git/**` — but a config that overrides `exclude`
loses even implicit protection against `dist/`. With no `include` either, the
default glob (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) happily collects **compiled
tests from `dist/`**. In `apps/api` this ran a stale
`dist/services/matchmaking/score.test.js` alongside its own source for weeks —
20 phantom tests exercising whatever `tsc` last emitted, inflating the suite
from an honest 1099 to a reported 1119.

**Practice:** every vitest config that sets `exclude` must also set an explicit
`include` naming the real test roots (`apps/api/vitest.config.ts` now does).
An explicit `.test.ts` include can never match compiled `.js`, whatever is
sitting in `dist`.

### Approving a DID through `addMember` replaces its whole role set

**Verified 2026-08-17 (audit tranche 3, `6dfdf22`).** `addMember` routes role
changes through `replaceRoles`
(`packages/arbiter-client/src/group-mutation-port.ts:822`), which is
delete-then-insert — the target ends up with exactly the roles in the request,
never the union. Two `/membership/approve` probes in
`apps/api/tests/federation.test.ts` approved `memberDid: adminDid` with
`roles: ['member']`, which demoted the suite's own logged-in admin from
`['owner','admin']` to `['member']`. `apps/api/vitest.config.ts` runs with
`isolate: false`, so every later test in that file then ran against a session
that had silently lost its authority. Nothing failed — the later tests simply
stopped testing what their names claimed, which is the same failure mode as
§1's "tests that pass because the action never happened".

**Practice:** in fixtures, approve a freshly registered DID, never a privileged
one (`writeConsentRecord` takes an arbitrary `authorDid`), and pin the
invariant — `federation.test.ts` now asserts the admin still holds
`['admin','owner']` after the approve probes. `replaceRoles` is still
destructive by default, so the trap is available again to the next test that
approves a privileged DID.

### `pnpm --filter <pkg> run test -- <path>` does not narrow the run

**Verified 2026-08-20.** pnpm 11 forwards the `--` separator itself, so the
script runs as `vitest run -- <path>` and the path never reaches vitest's file
filter. Measured against `@coopsource/common`: the "filtered" command ran all
7 files / 110 tests. It fails in the expensive direction and says nothing —
you believe you ran one file, and on `@coopsource/api` you ran 115.

**Practice:** `pnpm --filter <pkg> exec vitest run <path>`, which does filter
(the same bogus path gives `No test files found`).

### The dev and federation Docker stacks cannot both be up

**Verified 2026-08-20** by reading the compose files.
`infrastructure/docker-compose.yml:35` and
`infrastructure/docker-compose.federation.yml:54` both publish mailpit on
`1025:1025`, so bringing up the second while the first is running fails on a
port collision. Stop one before starting the other.

More confusing, and worth recognising — *observed once during tranche 3,
recorded second-hand, not re-derived*: a root `pnpm test` run with the
containers **not** already started reports a failing run even though every test
passes, dying in a federation `afterAll` teardown timeout after the last
assertion. "122 passed" together with a non-zero exit is that, not a product
regression. Start the stack first
(`docker compose -f infrastructure/docker-compose.yml up -d`).

---

## 3. Build, typecheck, and deployment

*Verified by building and running the images on 2026-08-02 unless marked
second-hand.*

### Both production images build (fixed 2026-08-02) — and how they broke

All three defects were real; all are fixed. Recorded because the *shapes* recur:

- **`pnpm --filter <pkg> build` does not build workspace dependencies.**
  `apps/api`'s build script is plain `tsc`, so dependency build steps were
  silently skipped and `packages/db`'s `schema.sql` copy never ran. Use
  **`--filter "<pkg>..."`** (trailing three dots) to select the package *and* its
  dependencies. Dependency `dist/` directories may still appear in the image by
  other means, which makes this failure look like it cannot be happening.
- **A `--prod` prune re-runs the workspace's own `prepare` script.**
  `apps/web` has `"prepare": "svelte-kit sync"` and `@sveltejs/kit` is a
  devDependency, so the prune removed the tool and then invoked it:
  `svelte-kit: not found`. `CI=true` does not disable pnpm lifecycle scripts;
  `--ignore-scripts` does.
- **TypeScript does not copy non-`.ts` assets into `dist/`.**
  `0001_v11_baseline.ts` reads an adjacent `schema.sql` at runtime, which simply
  did not exist in the image. Any asset a compiled module reads needs an
  explicit copy step in the package's `build` script.
- **`governance-view` and `coop-view` were missing from the API image entirely**
  — manifest, source, `node_modules`, and `dist`. `apps/api` depends on both.

**Verify an image by running it, not by watching it build.** A build that
succeeds proves nothing about resolution or assets:

```bash
docker run --rm --entrypoint node <img> -e "import('./apps/api/dist/container.js').then(()=>console.log('OK'))"
docker run --rm --entrypoint sh   <img> -c "ls packages/db/dist/migrations/"
```

### `.dockerignore` patterns are anchored to the context root

**Verified 2026-08-03.** Unlike `.gitignore`, a `.dockerignore` entry `dist/`
excludes only the *root-level* `dist/` — **not** `packages/*/dist`. Use
`**/dist` to match at every depth. This is not cosmetic: the anchored patterns
shipped the host's nested `dist/` and `node_modules/` into every image build,
which **masked two real Docker bugs** for the entire life of the images:

- the web image never built `@coopsource/common` (bare `--filter` without the
  `...` suffix — the same defect fixed for the api image on 2026-08-02) and
  only worked because the host's compiled `packages/common/dist` rode along in
  the context;
- the api image `COPY`ed `packages/governance-view/node_modules`, a directory
  that **only existed on the host** — the package has zero prod dependencies,
  so `pnpm install --prod` deletes it in-image. Every api image built to date
  silently embedded the maintainer's laptop `node_modules` (typescript, vitest
  and all).

**Practice:** gate image changes with a build from a **clean context** (fresh
`git worktree` or `git archive` checkout). A build from the working tree
proves nothing while ignore patterns can leak host artifacts.

### tsc never deletes emit that becomes excluded — and turbo caches the corpse

**Verified 2026-08-03.** Adding an `exclude` to a build tsconfig does not
remove the previously-emitted output; `tsc` only writes, never reaps. Worse,
`turbo.json`'s `build.outputs: ["dist/**"]` snapshots whatever is in `dist/`
after the task — so a stale `.test.js` survives the rebuild **and gets baked
into the turbo cache**, resurrecting on every cache hit. After changing any
tsconfig `include`/`exclude`, clean the affected packages before rebuilding
(and see the pnpm 11 trap below for how *not* to clean them).

### turbo runs tasks in strict env mode — job-level env does not reach tasks

**Verified 2026-08-03, cost two review rounds (fixed in 495b009).** Turbo 2.8
strips the environment for each task down to its allowlist: a var set at
CI-job level (or in your shell) does **not** reach the task process unless it
is listed in that task's `passThroughEnv` in `turbo.json` (or turbo's small
built-in allowlist). The failure that taught this: `PGUSER`/`PGPASSWORD` set
in the GitHub job env for two federation tests that hardcode a credential-less
Postgres URL — pg reads those vars, the fix was "verified" against a real
container, and it was still dead, because turbo filtered the vars before
vitest ever started. **Verifying that a component reads env correctly is not
verifying delivery through turbo's filter** — probe the whole path (e.g. a
task that echoes the var, with and without the passthrough).

### pnpm 11 has a built-in `clean` command that shadows your scripts

**Verified 2026-08-03.** `pnpm --filter <pkg> clean` no longer runs the
package's `clean` script — pnpm 11 ships a built-in `clean` that rejects the
`--recursive` implied by `--filter`, and its fallback behaviour can run the
**current project's** clean script instead. At this repo's root that script is
`turbo clean && rm -rf node_modules`, i.e. the failure mode is a surprise
full-workspace teardown. Always use the explicit form:
`pnpm --filter <pkg> run clean`.

### Typecheck covers the tests now (fixed 2026-08-03, audit N-18)

The original trap — recorded here 2026-08-02 — was that `"include": ["src"]`
meant `tsc` never saw `tests/` (41 hidden errors in `apps/api` alone), there
was no `typecheck` turbo task, no root script, and no `.github/` at all.

As of the tranche-2 merge (`44afb1e`): every test-bearing package has a
`tsconfig.test.json` covering `src` + tests, `pnpm typecheck` runs 8 tasks via
turbo, and `.github/workflows/ci.yml` exists (build → typecheck → test plus a
docker-image job). Residual gaps, still real: `apps/api/scripts/` is outside
every tsconfig, `apps/web` relies on `svelte-check` (not wired into
`typecheck`), and **CI has never executed** — the repo is deliberately
unpushed, so treat the first real run as a debugging session, not a
formality.

### SvelteKit: sync after changing a `+page.server.ts` return shape

`svelte-check` reads generated `./$types`. Change what a `load` returns and the
check reports phantom errors (`Property 'x' does not exist on type ...`) until
you run:

```bash
pnpm --filter @coopsource/web exec svelte-kit sync
```

---

## 4. Language and library gotchas

### Zod 4 `z.string().url()` accepts `javascript:`

**Verified 2026-08-02:** `z.string().url().safeParse('javascript:alert(1)')`
succeeds. Any user-supplied URL rendered into an `href` needs an explicit
scheme allowlist (`http:`/`https:`). This is audit finding W-02.

### PostgreSQL `UNIQUE` with a nullable column does not constrain the default path

Postgres defaults to **`NULLS DISTINCT`**, so a `UNIQUE (a, b, c)` where `c` is
nullable permits unlimited duplicate rows whenever `c IS NULL` — and if `c` is
optional in the API schema, `NULL` *is* the common path. This is the root cause
of the patronage double-calculation (audit N-4), not any type mismatch. Use
`NULLS NOT DISTINCT` or a partial unique index.

### Kysely types arithmetic over a `numeric` column as `string`

`numeric(18,2)` columns are declared `ColumnType<string, string | number, ...>`
because PostgreSQL returns them as strings. Kysely derives the operand type of
`eb('balance', '+', x)` from the **select** type, so passing a `number` is a
type error under strict mode:

```
error TS2345: Argument of type 'number' is not assignable to parameter of type
'OperandValueExpressionOrList<Database, "capital_account", "balance">'
```

Pass `String(amount)`. node-pg text-encodes every bound parameter, so the wire
bytes are identical either way and PostgreSQL infers `numeric` from the
operator. Reaching for a raw `sql` template instead works but gives up
column-name checking. See `numericParam()` in
`apps/api/src/services/capital-account-service.ts`.

### A read-then-write is not fixed by wrapping it in a transaction

`READ COMMITTED` — PostgreSQL's default, and Kysely's — does not make
`SELECT balance` … `UPDATE SET balance = <computed>` safe. The transaction gives
atomicity, not isolation from a concurrent writer's committed update. Two
concurrent contributions still lose one.

What fixes it is doing the arithmetic in the database
(`SET balance = balance + :n`) and turning any precondition into a predicate on
the write (`WHERE id = :id AND balance >= :n`), then treating zero affected rows
as the failure case. The transaction is still needed — it keeps the ledger row
and the balance change together — but it is the smaller half of the fix.

### `pino-http` redaction only covers paths you list

`redact` does not know what is sensitive. The default serializers log
`req.url` (with query string), `req.query`, and the whole of
`res.getHeaders()`. Redacting `req.headers.cookie` leaves an OAuth `code=` in
the URL and a token in a `Location` response header untouched. See
`apps/api/src/middleware/logger.ts`.

### `Object.create(inner)` as a decorator — when it is safe

Used in `apps/api/src/services/public-write-guard.ts` to wrap `IPdsService`.
Prototype delegation is safe **only because** neither PDS implementation uses
`#private` fields (which do not traverse the prototype chain) and neither
mutates instance state after construction (a write would land on the wrapper,
shadowing the inner object and silently diverging). If either becomes untrue,
this decorator breaks in a way that is hard to diagnose — prefer explicit
delegation if you extend it.

---

## 5. Repository conventions that surprise people

### The audit and program documents live on a separate branch

`docs/complete-codebase-audit-2026-07-31` holds the 2026-07-31 audit, the
2026-08-01 assessment, and the handover set. They are **not on `main` or on
feature branches**, so `git status` on a feature branch may show the audit as
untracked, and the assessment may appear to not exist at all. Check that branch
before concluding a document is missing.

### Never create new migration files

`0001_v11_baseline.ts` is the permanent bootstrap. Schema changes edit
`packages/db/src/schema.ts` **and** regenerate
`packages/db/src/migrations/schema.sql`. See CLAUDE.md.

### There was no 403 error class

`packages/common/src/errors.ts` had `NotFound`, `Unauthorized` (401),
`Validation` (400), `Conflict` (409) — no `Forbidden`. Authorization failures
were surfacing as 401, conflating "who are you" with "you may not". `ForbiddenError`
was added 2026-08-02; use it for authorization refusals.

---

## 6. ATProto ecosystem

*Observed 2026-08-02. This section ages fastest — re-verify against primary
sources (GitHub API, `registry.npmjs.org`) before acting.*

### The `#5187` pin bump is cheaper than it looks

Directory listings at CSN's pin `3f6c96d5` and the then-current head `c5962d7`
return **identical blob SHAs** for every file under `com/atproto/space` and
`com/atproto/simplespace`. The intervening commits are TypeScript
implementation only. Repinning is a review, not a lexicon regeneration.

### OAuth `repo:` scopes are a live break, not future work

Released `@atproto/pds` 0.5.23 calls `permissions.assertRepo({action,
collection})` on OAuth credentials, short-circuiting true only for
`transition:generic`. `apps/api/src/auth/oauth-client.ts` requests `atproto`
plus `rpc:` scopes — neither. **Member record writes will be rejected by a
released PDS.** The fix ships today in `@atproto/oauth-scopes` 0.5.7
(`RepoPermission.scopeNeededFor`). The in-code comment claiming the PDS does
not enforce this yet is stale. This is audit A-06, and it gates any real-PDS
exercise.

### `@atproto/space` is not published

`registry.npmjs.org/@atproto/space` 404s. Nothing from #5187 has merged to
`main`. Independent implementations mirror the surface under vendor namespaces
(`network.habitat.space.*`, `zone.stratos.space.*`) rather than using
`com.atproto.*`, so **cross-implementation interop is currently zero by
construction** — do not claim it.

### Lexicon Community no longer gates working groups

Amended 2026-07-26: working groups are self-formed, no TSC vote required to
begin; approval moves to PR time and the bar is demonstrated real-world use.
This obsoletes the "start sponsorship outreach early" guidance in
ARCHITECTURE-V12 §12. The canonical repo moved to
`tangled.org/lexicon.community/lexicons`; the GitHub mirror is archived.

---

## Changelog

- **2026-08-02** — created during the tranche-1 audit remediation program.
  Sections 1–6 as above.
- **2026-08-02** — added the DDL-in-tests hazard and the orphan sweep after a
  self-review found that testing the sweep against a real server was itself
  destabilising the suite.
- **2026-08-04** — tranche-2 hazards (merged at `44afb1e`): vitest exclude
  replacement, `.dockerignore` root-anchoring masking two image bugs, tsc
  stale-emit + turbo cache capture, turbo strict env filtering, the pnpm 11
  `clean` builtin; updated the typecheck-coverage entry (N-18 fixed) and the
  test-container entry (N-19 tripwire).
- **2026-08-20** — tranche-3 hazards (branch `feature/audit-tranche-3-c04-a07`):
  `addMember`/`replaceRoles` demoting a privileged DID for the rest of a
  non-isolated test file, `pnpm run test -- <path>` silently running the whole
  suite, and the two Docker stacks colliding on mailpit's port plus the
  teardown timeout that reports a green suite as a failing run.
- **2026-08-26** — tranche-4 hazards (branch
  `feature/audit-tranche-4-money-integrity`): the test app mounting 19 fewer
  route modules than production, Vitest 4 swallowing `console.log` so a probe
  reads as dead, Kysely's `transformResult` as an async seam for deterministic
  interleaves, Kysely typing `numeric` arithmetic operands as `string`, a
  transaction alone not fixing a read-then-write, and a concurrency pin that
  passed 3/3 against the code it was written to catch.
