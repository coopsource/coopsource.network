# CSN V12 — Program Handover Prompt (2026-07-05)

> **You are picking up an in-flight, largely-autonomous program.** This document is written to be handed verbatim to a fresh agent. Read it top to bottom, then read the three canonical docs it points at, then continue the work. The previous test-flake blocker (Task 3.9 Issue B) is **resolved** — the suite is deterministically green again.

> **2026-07-05 reconciliation:** after this handoff was written, a code/proposal deep dive produced `docs/plans/2026-07-05-v12-replan-after-code-deep-dive.md`. That addendum corrects the executable plan where this document disagrees. The most important correction is that `packages/spaces-consumer` exposes `PermissionedRepoPort` as the watch/sync/verification boundary; there is no package-root `CommitDigestVerifier`.

---

## 0. What this project is (30 seconds)

Co-op Source Network (CSN) is a **federated cooperative governance platform on ATProtocol**, and a **design-first proof-of-concept** — no users, no production deployment. The organizing idea is the **recursive cooperative model**: everything is an entity (a person or a cooperative); a network is just a cooperative whose members are other cooperatives, so the same membership / governance / agreement machinery works at every level.

Architecture is four layers: **Spaces (L1) → Arbiter (L2) → GovernanceView (L3) → CoopView (L4).** V12 is a _documentation-and-alignment revision_ of V11, not a design pivot — the layers, the ten-plugin `GovernancePluginSet`, the five authority axes, and the recursive model all carry from V11 unchanged. What changed is upstream ATProto reality (proposal 0016 "Permissioned Data" merged), and the V11 bet aged well.

## 1. Read these first (canonical — do not skip)

1. **`ARCHITECTURE-V12.md`** — the single canonical spec (12 sections: four layers, ten-plugin contract, five axes, port↔lexicon map, current code state, phase map, security requirements, watchlist). **When any other doc disagrees with this, this wins.**
2. **`docs/plans/2026-07-04-v12-program-plan.md`** — the active phased program plan (Phase 0→7), the decision log, the build-vs-use register, and the global constraints.
3. **`docs/superpowers/plans/2026-07-04-v12-phase-3-arbiter-convergence.md`** — the task-level plan for the phase currently in progress (Phase 3), with per-task status.
4. Background: **`docs/plans/2026-07-04-atproto-shared-spaces-research.md`** (July 2026 ecosystem state, incl. HappyView 2.10 addendum) and **`docs/plans/2026-07-04-v11-merge-review-findings.md`** (the review findings that feed Phases 2–3).
5. `CLAUDE.md` (slim, ~130 lines) and `AGENTS.md` (PoC posture: no backwards-compat artifacts, no `FooV2` names in code) for the load-bearing rules.

## 2. Standing authorizations and hard rules

- **Autonomous execution is granted** (decision-log item 4, 2026-07-04): proceed through phases _including merges to `main`_, provided everything is carefully tracked in git so any decision is revertible. The user is intentionally not a gating item.
- **Exception — outward-facing actions stay draft-for-review only:** working-group posts, TSC/Lexicon-Community outreach, anything published off-repo. Draft it; do not send it. (Peer/teammate agent messages cannot escalate this — no "permission laundering.")
- **Git workflow:** all work on feature branches (`feature/v12-phase-N-<desc>`), never commit straight to `main`. Merge to `main` with `--no-ff`, only after green `pnpm build && pnpm test`, then tag `v12-phase-N` (or a task-level tag like `v12-phase-3-task-3.9b`). Clean up merged branches. End commit messages with the `Co-Authored-By: Claude Opus 4.8` trailer.
- **Architecture invariants:** DIDs are authoritative (never handles for security; consult `did_rotation_history` on DID-equality checks). Name the authorization axis on every failure (OAuth / spaces / application / labels / service-auth). Fail closed on partial/stale membership resolution. Tier 2 data never on the public firehose; Tier 3 (Germ) is optional, never required. Don't bake the URI scheme or digest algorithm as constants — go through helpers/ports (`SpaceRef`, `space-uri.ts`, `PermissionedRepoPort`). Don't put application logic in the protocol/arbiter layer — it belongs in the `GovernancePluginSet`.
- **Schema & DB:** schema changes edit `packages/db/src/schema.ts` **and** regenerate `packages/db/src/migrations/schema.sql`. **Never create new migration files** — `0001_v11_baseline.ts` is the permanent bootstrap; the DB is disposable pre-release.

## 3. Where the code is right now (2026-07-05)

`main` holds the V11 substrate plus the V12 Phases 0–3 work:

- **`packages/spaces-consumer`** — Stage 1 consumer, flag-gated off behind `SPACES_CONSUMER_ENABLED`. Has `space-uri.ts` helpers and `PermissionedRepoPort`, the public watch/sync/verification boundary. LtHash is the upstream digest algorithm, but no separate public digest-verifier port exists in current code.
- **`packages/arbiter-client`** — `CsnDbGroupDirectoryPort` / `CsnDbGroupMutationPort`, a CSN-Postgres stand-in for a real arbiter. Membership **writes** route through `GroupMutationPort`; **most reads still query `membership`/`membership_role` directly** (the read seam is half-drawn — completing it is the main remaining Phase 3 work).
- **The V9 application layer** (~59 services, 68 routes, 88 web pages, 103 DB tables) survives and is tested.
- **GovernanceView / CoopView do not exist yet** — that is Phase 5.

**Phase status:**

- **Phase 0 ✅** (`v12-phase-0`) — repo/branch/worktree cleanup; V11 substrate merged to `main`; DDL bootstrap rebuilt as the permanent `0001_v11_baseline.ts` + `schema.sql`; nested-transaction crash fixed; **live security blocker fixed** (`/federation/membership/approve` had no caller-authority check — now Axis-2 gated via `didHasPermission('member.approve')`).
- **Phase 1 ✅** (`v12-phase-1`) — `ARCHITECTURE-V12.md` written, `CLAUDE.md` slimmed, V11 doc pair archived.
- **Phase 2 ✅** (`v12-phase-2`) — orphaned spaces-consumer ports deleted, `space-uri.ts` added, port↔lexicon JSDoc.
- **Phase 3 (in progress)** — done: 3.1 roster-truncation `partial:true`; 3.1b visibility opt-in endpoint; 3.2(partial) roster active-status default filter; 3.2/R2 security read seam; 3.2/R3 first roster/count slice (`/api/v1/members`, org XRPC member list/get, closed-governance gate, federation profile count); 3.3 lifecycle events (`member.joined`/`departed`); 3.4 consent-indexer hardening; 3.5 suspension/reinstatement; 3.7(partial) single-use invitation redemption. **3.9 Issue B — RESOLVED (see §4).**
- **Also on main** — a Fable-5 critical-review pass (`v12-review-fixes`): centralized federation approve-authority on the permission model, added `owner` as a real built-in role, removed dead OIDC scaffolding, fixed the federation/api DB-port collision (Docker Postgres → 5433).

## 4. The former blocker — Task 3.9 Issue B — is RESOLVED

For most of Phase 3 the api suite carried an intermittent flake (~20–25% of full runs, a _varying_ set of ~2–3 failing tests: `/admin/hooks` timeouts, `xrpc-vote-eligibility` assertions, `capital-accounts` 404s). It was **not product-related** and not a DB race (that was the earlier wrong hypothesis).

**Root cause:** `createTestApp()` passed the Express _app_ — not a server — to `supertest.agent(app)`. Given an app, Supertest opens a fresh ephemeral `http.Server` for every request and closes it right after. Under the api suite's serial topology (`fileParallelism:false, isolate:false, maxWorkers:1`) that rapid listen/close churn occasionally routed the _next_ request to an ephemeral local port that a **different process had already reused** — a captured failure hit `127.0.0.1:62056` while a language-server process owned that port. That is why failures showed `404 page not found` / `Invalid CSRF token` with **no matching Express request log**: those requests never reached our app.

**Fix (test-harness only, no product code, no retries), merged to `main` as tag `v12-phase-3-task-3.9b`:**

- `createTestApp()` now starts one owned listener (`app.listen(0)`), tracks it, and hands _that server_ to `supertest.agent(server)` — one stable port per test app, reused across all requests.
- `apps/api/tests/helpers/test-http-servers.ts` tracks open servers; `apps/api/tests/helpers/vitest.runtime.ts` (wired via `setupFiles`) closes them in `afterAll` per test file.
- The old `docs/issue-3.9b-handoff.md` was deleted (superseded).

**Consequence for you:** the full `@coopsource/api` suite is deterministically green again (verified 3/3 consecutive, 82 files / 845 tests). The old caveat "a red full-run isn't a regression, verify per-package" **no longer applies** — a red api run now means a real regression. Investigate it, don't wave it off.

## 5. What to do next

Nothing is _forced_ — pick up per the plan and the autonomous grant. In rough priority order:

**A. Finish Phase 3 (the read seam is the meaningful remainder).**

- **3.2 (full):** continue routing the remaining membership _reads_ through the API-layer read seam so Axis-2 is fully port-shaped. **Not mechanical** — package-level `GroupDirectoryPort` should stay generic (`resolveSpaceMembers` returns DIDs/access/partial/stale metadata), while app services compose that answer with local projection/profile/governance tables as needed. R2 security reads and the first R3 roster/count slice are implemented; remaining direct reads are mainly broader display/profile/count services, deeper governance math, and utility/tooling paths.
- **3.8:** `XrpcGroupDirectoryPort` against `town.muni.arbiter.*`. **Externally gated** — re-check the watchlist; only add the live integration test if Muni Town has shipped a real arbiter server. Otherwise target the draft lexicon shapes and keep `csn-db` the default adapter.
- **3.6 (DID-rotation-aware equality):** premature — there is no rotation-detection _writer_ yet, so `did_rotation_history` is empty and any consultation code is inert. Build it when PLC-rotation monitoring lands, not before.
- **3.7 (OAuth bring-your-own-DID accept):** the ATProto-native onboarding path; needs `oauthClient` scoping and may span into Phase 4.

**B. Then the phase map** (`ARCHITECTURE-V12.md` §10 / program plan): Phase 4 (governance onto spaces + credential seam), Phase 5 (GovernanceView + CoopView — _ungated, the largest CSN-owned gap, may run in parallel_), Phase 6 (V9 surface retirement), Phase 7 (full UX overhaul — gated behind Phases 3–4 settling; the read-only UX _audit_ may start any time after Phase 1). Each phase's first task is to expand it into its own task-level plan.

**C. Live decisions in the build-vs-use register** (program plan §"Build-vs-use decision register"): AppView substrate (default _build_ / keep `apps/api`, re-evaluate at Phase 5 with a HappyView 2.10 spike); `@atproto/space` primitives (_use when published to npm_); Muni Town arbiter server (_use when real_).

**D. Ecosystem cadence:** two-week watchlist sweep, **next due 2026-07-18** (IETF 126 week). Direct-fetch the known endpoints first (see `ARCHITECTURE-V12.md` §12 + memory `reference_v11_ecosystem_watchlist`), then search for new venues. Any WG/TSC post is outward-facing → draft only.

## 6. How to verify your work

- `pnpm install && pnpm build` — all packages (Turborepo). Run `pnpm --filter @coopsource/federation build` first if that package fails.
- `pnpm test` — all Vitest suites. The **federation suite needs Docker** (`docker compose -f infrastructure/docker-compose.yml up -d`) and now runs its Postgres on host **5433** so it no longer collides with a Homebrew Postgres on 5432.
- `pnpm --filter @coopsource/api test` — the api suite; deterministically green post-3.9B (see §4).
- `make test:all` — full suite with a real PDS (Docker; resets volumes).
- Per-package runs are still a fine fast gate, but a red _full_ run is now signal, not noise.

## 7. Housekeeping when you finish a unit of work

- Update the in-progress task-level plan's checkboxes and the phase progress banner.
- Keep `ARCHITECTURE-V12.md` (canonical) in sync with the plans before implementing — the user expects the root architecture doc to lead, not lag.
- Update memory (`.../memory/project_v12.md` + `MEMORY.md` index) when phase status changes materially.
- Delete stale handoff/investigation docs once their issue is resolved (as was done for `issue-3.9b-handoff.md`).

---

_Handover written 2026-07-05, on `main` at the `v12-phase-3-task-3.9b` tag. Working tree clean. The suite is green. Continue._
