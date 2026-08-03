# Audit Tranche 1 — Closeout and Session Handover

- **Date:** 2026-08-02
- **Branch:** `feature/audit-tranche-1-gate0-p0` (19 commits) — merged to `main`
- **Baseline:** `main` at `9c7a496` before this work
- **Program:** [2026-07-31 complete codebase audit](./2026-07-31-complete-codebase-audit-and-refactor-plan.md)
  + [2026-08-01 assessment](./2026-08-01-audit-assessment-and-refactor-program.md)
- **Verification at close:** `pnpm build` + `pnpm test` green — 1119 API tests,
  115 files, 17/17 turbo tasks. Both Docker images build and were run.

---

## 1. What shipped

### Approved tranche-1 set (Gate 0 + P0)

| ID | Finding | State |
|---|---|---|
| C-01 | Public firehose governance bypassed all application authority | Fixed — projection requires an active membership in an active cooperative, plus a replay-safe deadline test |
| C-02 | `node:vm` script sandbox escapable to process access | Fixed — routes 410, execution throws, vm worker and spawner deleted |
| C-03 | Tier 2 records reachable on public repos | **Partially fixed** — see §2 |
| S-01 | Coordinators could self-promote to `admin`/`owner` | Fixed — permission-subset ceiling covering grant *and* removal, on HTTP and federation paths |
| S-02 | `membership_policy` stored but never enforced | Fixed — enforced at registration; approval route added |
| S-03 | Session cookies and bearer credentials logged | Fixed for headers — see §2 for the residue |
| S-06 | Payment webhook could complete another co-op's session | Fixed — lookup scoped to the authenticated cooperative and provider |

### Found and fixed during self-review (not in the original audit)

Eleven defects in the tranche's own fixes, plus:

- **N-7** — the test harness could not isolate a run; concurrent runs dropped
  each other's database, producing hundreds of phantom failures. Each run now
  owns `coopsource_test_<pid>`, reclaimed at setup if a run is killed. This also
  retired the manual `psql DROP` workaround between vitest and Playwright.
- **O-01 / O-02 / N-8** — neither production image built and no container could
  create a schema. Both build now, verified by running them.

### Documentation

- [agent-learnings.md](../agent-learnings.md) — hazards and gotchas
- [agent-debugging-playbook.md](../agent-debugging-playbook.md) — locating root cause
- [agent-testing-practices.md](../agent-testing-practices.md) — tests that catch things

---

## 2. Known-incomplete — read before trusting a fix

These are **deliberately partial**, and their tracking documents previously
overstated them. Do not assume "C-03 fixed" means contained.

- **C-03 is half done.** Confidential collections can no longer *reach* a public
  repo — the guard is at the write boundary
  (`apps/api/src/services/public-write-guard.ts`) and covers `IPdsService` plus
  `MemberWriteProxy`. But **stakeholder terms, funding pledges, and operator
  writes of role-scoped collections now return 501**, because those collections
  have no permissioned destination. That is containment, not a working feature.
  Giving them one needs member-class space resolution and a real permissioned
  writer (A-12 / AM-6), which is Phase 2/6 work.
- **Tier 1 publication is unreachable.** Nothing passes
  `lifecycleState: 'published'`, and `openProposal` does not republish, so no
  proposal ever reaches the public repo. Contradicts ARCHITECTURE-V12 §8 Tier 1.
  Root cause is A-03 (lifecycle changes never touch the repo record).
- **Every proposal carries `cid: 'private'`** — the `private_record`
  compatibility writer's fake CID, now on the default path (A-12).
- **R-3** — C-01 implements membership, cooperative, and deadline, but not the
  *status* gate C-01's own text names. A firehose ballot can still be projected
  against a `draft` proposal. Deferred deliberately: the naive fix (test current
  `status`) is not replay-safe. Correct fix is `createdAt < opens_at`, and
  `opens_at` is currently never populated by `indexProposal`.
- **R-4** — S-03 redacts headers only. The same log line still records the OAuth
  `code` in `req.url`/`req.query` and the session-exchange token in the
  `Location` response header.
- **The membership check in `indexVote` is replay-sensitive.** A member who
  later departs would have their historical ballot discarded on replay (L-07).
  Cannot be dropped — it *is* the C-01 fix. Phase 4's eligibility snapshot
  resolves it.

---

## 3. What is left, in recommended order

Ordering is from the 2026-08-02 multi-agent review, adjusted for what shipped.

### Immediate — trustworthy signal and enforcement

1. **N-18 / no CI.** `apps/api/tsconfig.json` is `"include": ["src"]`, so tests
   are never typechecked (41 hidden errors). There is no `typecheck` turbo task,
   no root script, and **no `.github/` directory at all**. Add a typecheck-only
   tsconfig, a turbo task, and CI. Nothing else is durable without it.
2. **N-20** — one line in `vitest.config.ts` (see review report).

### The still-open criticals

3. **C-04** — the only confirmed *unprivileged* forgery. A plain member, or an
   unapproved applicant, mints and retracts legal signatures for arbitrary DIDs:
   `federation-auth.ts:19-21` short-circuits verification for any local session,
   and five agreement handlers never call `federationCallerDid()`. Fold in A-07's
   minimal containment (require `@method`/`@target-uri` coverage and a
   `content-digest` whenever a body is present).
4. **C-06 + N-3 + N-4** — the only findings that create or destroy money under
   ordinary single-user operation. Two concurrent $100 redemptions against a $100
   balance both succeed; three identical patronage POSTs yield a 240 balance for
   a $100 surplus (root cause is `NULLS DISTINCT` on a nullable column in the
   UNIQUE, not any type mismatch); an approved expense can be raised past review
   and double-reimbursed (no status CAS).
5. **C-05** — fix at `pipeline.ts`, not `loop.ts`; `processFirehoseEvent`
   absorbs errors internally, so a `loop.ts`-only change does nothing. Bundle
   O-12's missing dead-letter retry.
6. **S-08** — root is `packages/common/src/did-web.ts` (an `http://` downgrade
   for dotted-quad hosts, honoured `%3A` ports). Wire the existing
   `url-validation.ts` into DID resolution with `redirect: 'manual'` and
   post-resolution IP checks.

### New surface from the review

7. **N-1** — `GET /api/v1/cooperative` returns an *arbitrary* cooperative (no
   actor predicate, no `ORDER BY`); the settings page can read one co-op and
   write another, including public-visibility flags. 28 files inherit it.
8. **N-2** — the MCP endpoint is 100% non-functional (a fresh transport per
   request rejects every session), **and** four of its tools ignore the
   cooperative binding. Fix both in one commit or shipping the transport fix
   ships a cross-tenant search primitive.
9. **N-16 / N-17** — `api_token` never re-checks membership or entity status,
   tokens default to never expiring, and a cooperative cannot revoke one it did
   not create.
10. **`apps/api/src/ai/`** — the last surface nobody has reviewed, on the same
    token path.

### Ecosystem-driven

11. **A-06, re-graded upward.** Not forward-compat work: released
    `@atproto/pds` 0.5.23 calls `permissions.assertRepo(...)`, and CSN requests
    neither a `repo:` scope nor `transition:generic`, so **member writes will be
    rejected by a released PDS**. Fix ships today in `@atproto/oauth-scopes`
    0.5.7. Gates any real-PDS exercise.
12. **Repin #5187** `3f6c96d5 → c5962d7` — now review-only: blob SHAs are
    identical for every `com/atproto/space` and `simplespace` lexicon.
13. **Lexicon Community WG** — working groups are self-formed since 2026-07-26
    (no TSC gate), `community.lexicon.governance.*` is uncontested, and the bar
    is demonstrated real-world use. Outward-facing; needs user review.

### Deprioritised

P0-01 responsive shell (real, medium, one aside + one wrapper), N-6 WCAG token
contrast (three tokens, no security dimension).

---

## 4. Open decisions still blocking phases

From the assessment's decision register: **#3** governance record model (blocks
Phase 2), **#4** admission default (setup now takes `membershipPolicy`,
defaulting to `open`, which preserved prior behaviour — the product default is
still yours), **#5** finance visibility (Phase 1), **#6** migrations policy
(Phase 7), **#7** OAuth resource server (Phase 2), **#9** Tier 2
retention/deletion (Phase 5/6), **#10** network joining approval (Phase 1).

---

## 5. Standing constraints

- Feature branches only; `--no-ff` merges; green `pnpm build && pnpm test` first.
- Do not delete branches.
- `SPACES_CONSUMER_ENABLED=false` outside conformance environments.
- Treat Proposal 0016 / PR #5187 as an executable draft, never a stable
  dependency. Re-check the live head before any Phase 6 work.
- Do not bake space-URI shapes into storage keys or lexicons (AM-7).
- Work in `/Users/alan/projects/utm/vmshared/coopsource.network` only. The clone
  at `~/projects/coopsource.network` is stale and must not be used.

---

## 6. Bootstrap prompt for the next session

```text
Continue the Co-op Source Network audit remediation. Work in
/Users/alan/projects/utm/vmshared/coopsource.network (never ~/projects/coopsource.network).

READ FIRST, in order:
1. docs/plans/2026-08-02-audit-tranche-1-closeout-and-handover.md — what shipped,
   what is deliberately incomplete, and the ordered backlog. Start here.
2. docs/agent-learnings.md, docs/agent-debugging-playbook.md,
   docs/agent-testing-practices.md — the hazards and methods that made the last
   phase work. Section 1 of the learnings file matters most.
3. docs/plans/2026-07-31-complete-codebase-audit-and-refactor-plan.md — the
   canonical audit. NOT normative: it contains verified false positives, dead
   code cited as evidence, and severities that assume a disabled flag is on.
   Re-derive any finding before funding work on it.

STATE: tranche 1 (Gate 0 + P0) is merged to main. Build and both Docker images
are green; the test harness is now isolated per run. Section 2 of the handover
lists what is only partially fixed — read it before trusting any "fixed" label,
especially C-03.

DO NOT trust a green suite as proof. The suite was green through eleven real
defects in this program. Execute the thing you are verifying; when chasing an
intermittent, loop until failure rather than sampling three clean runs.

START WITH: step 1 of the handover's ordered backlog (typecheck coverage + CI),
unless the user directs otherwise. Confirm the plan before implementing.
```
