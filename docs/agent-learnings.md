# Agent Learnings — hazards, traps, and time-savers

Working notes for whoever picks this repo up next, human or agent. Everything
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

---

## 3. Build, typecheck, and deployment

*Second-hand from a multi-agent review 2026-08-02 except where marked verified;
re-confirm before acting.*

### Neither production image builds

- `apps/api/Dockerfile` — fails with TypeScript errors; omits the
  `governance-view` and `coop-view` workspace packages that `apps/api` depends
  on (audit O-01).
- `apps/web/Dockerfile:17` — **verified**: `RUN CI=true pnpm install
  --frozen-lockfile --prod` re-runs `apps/web`'s `"prepare": "svelte-kit sync"`
  (`apps/web/package.json:11`) *after* `@sveltejs/kit` has been pruned as a
  devDependency, so it dies at `svelte-kit: not found`. `CI=true` does not
  disable pnpm lifecycle scripts, and `.npmrc` is never copied into the image.
  Use `--ignore-scripts`.
- `packages/db/dist/migrations/schema.sql` is ENOENT in the image: TypeScript
  does not copy the `.sql` asset that `0001_v11_baseline.ts` reads, so a
  container deployment cannot create a schema (audit O-02).

### Typecheck covers less than it appears to

**Verified:** `apps/api/tsconfig.json` is `"include": ["src"]`, so `tsc` never
sees `tests/`. `package.json` wires *both* `build` and `typecheck` to it. There
is **no** `typecheck` task in `turbo.json`, no root `typecheck` script, and **no
`.github/` directory at all** — there is no CI. `packages/federation` and
`packages/lexicons` have the same `"include": ["src"]`.

Consequence: `pnpm build` passing says nothing about test-file type safety.

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
