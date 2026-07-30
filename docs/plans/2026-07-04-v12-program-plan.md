# CSN V12 Program Plan — Cleanup, Docs Consolidation, ATProto Alignment, UX Overhaul

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Phases 0–2 are specified at task level and are executable now. Phases 3–7 are phase specifications; the first task of each is to expand it into its own task-level plan (superpowers:writing-plans → `docs/superpowers/plans/`) once its entry gate clears.

**Goal:** Bring the repo, docs, and substrate into alignment with July 2026 ATProto reality (per `docs/plans/2026-07-04-atproto-shared-spaces-research.md`), advance the four-layer architecture through the remaining stages, then execute a full UX overhaul.

> **2026-07-05 re-plan:** `docs/plans/2026-07-05-v12-replan-after-code-deep-dive.md` is the active addendum for Phase 3 onward. It reconciles this plan with current code and Proposal 0016. Where this file says to create or use a package-root `CommitDigestVerifier`, read that as superseded: current code exposes `PermissionedRepoPort` as the public watch/sync/verification boundary.

**Architecture:** Same four layers as V11 (Spaces → Arbiter → GovernanceView → CoopView) — V12 is a _doc-and-alignment_ rev, not a design pivot. Grounded facts: proposal 0016 merged upstream (`at://…/space/…` URIs, LtHash digests, three-token credentials); 16 draft `town.muni.arbiter.*` lexicons exist; GovernanceView/CoopView are unbuilt; all V9 retirement targets still live.

**Tech Stack:** Unchanged — TypeScript strict, Express 5, Kysely 0.28+/PostgreSQL 16, SvelteKit 2/Svelte 5 runes, Tailwind 4, Vitest 4, Zod 4, pnpm 10+/Turborepo, ATProto only.

## Decision log (user, 2026-07-04)

1. **Merge policy:** Review the codex branch, then merge to `main` (explicit approval granted for the Phase 0 merge, conditional on review + green tests).
2. **V12 doc shape:** Consolidate to **two** docs — `ARCHITECTURE-V12.md` (canonical spec, absorbing the operational prompt) + slim `CLAUDE.md` (~150 lines). `CLAUDE-CODE-PROMPT-*` line ends at V11.
3. **UI/UX spike scope:** **Full UX overhaul** — distinctive visual direction + design system, information-architecture restructuring, navigation redesign, and empty/error/loading sweep across all 88 pages. Sequenced after the ATProto work settles (Phases 3–4).
4. **Autonomous execution (2026-07-04):** the user is not a gating item. Standing approval to proceed through phases — including merges to `main` — provided everything is carefully tracked in git (no-ff merges, `v12-phase-N` tag at each phase completion) so any decision can be reverted. **Exception:** outward-facing communications (WG posts, TSC outreach, anything published off-repo) remain draft-for-review only.
5. **HappyView 2 entered the build-vs-use register** (below) as a live candidate rather than a foreclosed option. The 2026-07-11 Phase 5 spike resolved the open decision: keep the custom AppView and use HappyView as a spaces/reference harness.

## Global Constraints

- **Merges to `main` proceed autonomously under decision-log item 4**: always `--no-ff`, always green build+tests first, tag `v12-phase-N` at each phase completion. The old approval rule is replaced by revertibility.
- **All work on feature branches.** V12 naming: `feature/v12-phase-N-<short-description>`.
- **PoC posture (AGENTS.md):** no backwards-compatibility artifacts; rename canonical types in place; no `FooV2` names in _code_ (doc filenames are versioned by convention — that stays).
- **Schema changes go into `packages/db/src/schema.ts`** — never new migration files.
- **DIDs authoritative; consult `did_rotation_history`; Tier 2 never on the public firehose; fail closed on partial/stale membership resolution.**
- **Don't bake the URI scheme or digest algorithm as constants** — helpers and ports only (`SpaceRef`, `space-uri.ts`, `PermissionedRepoPort`).
- **Errors name their authorization axis** (OAuth / spaces / application / labels / service-auth).
- Build federation package after structural changes: `pnpm --filter @coopsource/federation build`.
- Verification commands for every phase: `pnpm build && pnpm test` (Vitest), `make test:all` for the full suite when Docker is available.

## Build-vs-use decision register

Standing register of "do we build this or adopt an existing implementation" questions. Each row names its decision point; defaults hold until a spike says otherwise. Lives on in ARCHITECTURE-V12 §10 after Phase 1.

| #   | Capability                                                                       | Build option (current)                                                               | Use option (candidate)                                                                                                                | Default                                                                                                                                                                              | Decide at                                                                                  |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 1   | **AppView substrate**                                                            | Custom `apps/api` Express AppView (alive and tested)                                 | **HappyView 2.11.4** — schema-driven AppView, `com.atproto.space.*` endpoints, LtHash, oplog, notifications, Lua/WASM extension model | **Build confirmed** — all 58 CSN canonical/draft documents loaded, but all 8 queries need custom semantics and the typed plugin/projection model would require a Lua/storage rewrite | **Decided 2026-07-11.** See `docs/plans/2026-07-11-v12-phase-5-happyview-appview-spike.md` |
| 2   | **Spaces dev/test harness**                                                      | Hand-rolled fixtures (`InMemoryPermissionedRepoPort` etc.)                           | **HappyView 2.10** as a local spaces server the consumer syncs against                                                                | **Use** (near-certain) — it exercises notification→pull→digest→cross-check end-to-end without us building a fake PDS                                                                 | Phase 3 start                                                                              |
| 3   | **Spaces protocol primitives** (digest verify, oplog decode, credential parsing) | Extend `spaces-consumer` internals behind `PermissionedRepoPort`                     | **`@atproto/space`** from PR #5187 once published to npm (not published as of 2026-07-05)                                             | **Use when published** — first-party primitives; our ports were designed for exactly this swap                                                                                       | Watchlist check each sweep; adopt in Phase 3/4 when it ships                               |
| 4   | **Group directory / arbiter server**                                             | `CsnDbGroupDirectoryPort`/`CsnDbGroupMutationPort` over CSN tables (current interim) | Muni Town arbiter server speaking `town.muni.arbiter.*` (promised "soon", unshipped as of Jul 4)                                      | **Build interim, use when real** — the ports are the seam                                                                                                                            | Phase 3; integration test the day it ships                                                 |
| 5   | **Axis-3 policy engine**                                                         | TS `GovernancePluginSet` (ten typed plugins)                                         | Rego/OPA (what the arbiter prototype uses server-side)                                                                                | **Build** — the plugin set _is_ the Layer 3/4 contract; Rego belongs to the arbiter's side of the boundary, not ours                                                                 | Firm unless Phase 5 finds plugin-set gaps                                                  |
| 6   | **Tier 3 E2EE**                                                                  | (never build)                                                                        | Germ DM / MLS                                                                                                                         | **Use, optional-only** — still iOS-only                                                                                                                                              | Re-check on Android/desktop parity news                                                    |

## Phase ordering rationale

Repo cleanup first (user priority: must know which branch is truth before judging which docs are stale). Docs second, because V12 docs must describe merged-to-`main` reality, and every later phase cites them. Code drift-alignment third (small, unblocks upstream-facing work). Then substrate stages; GovernanceView/CoopView (Phase 5) is **ungated and may run in parallel** with Phases 3–4 if capacity allows. Stage-8 retirement waits for 3–5 to stabilize. UX overhaul last by explicit user priority, but its _audit_ task is read-only and may start any time after Phase 1.

---

## Phase 0 — Repo, branch, and worktree cleanup

**Inventory (verified 2026-07-04):**

| Item                                             | State                                                                                                      | Disposition & why                                                                                                                                                                                                                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codex/v11-atproto-alignment-planning` (current) | 33 commits ahead of `main`; contains ALL V11 substrate code; not on origin                                 | Review → merge to `main` → delete. It is the only copy of the V11 implementation; unmerged it makes `main` (docs-only) lie about the project.                                                                                                                                                   |
| `feature/v11-stage-1-spaces-consumer`            | Strict ancestor of codex branch (verified `git merge-base --is-ancestor` = yes); not on origin             | Delete after merge — fully contained, zero unique commits.                                                                                                                                                                                                                                      |
| `feature/v7-declarative-hooks`                   | 1 commit ahead (`54cc066`, V7 P7 declarative hooks + admin lexicon management), forked at V7-era `1599ce8` | Tag `archive/v7-declarative-hooks`, then delete. Why: V7 is two architectures gone, and the feature direction (declarative config hooks / runtime lexicon admin) is what V11 explicitly rejected (Pitfall #4, no HappyView-style scripting substrate). Tag preserves the commit if ever wanted. |
| `chore/opus-4.7-config-upgrade`                  | Merged to `main`; copy on origin                                                                           | Delete local + remote branch — merged branches get cleaned per CLAUDE.md.                                                                                                                                                                                                                       |
| `main`                                           | **11 commits ahead of `origin/main`** (all docs: V11 direction/addendum/archives)                          | Push after merge.                                                                                                                                                                                                                                                                               |
| Worktree `.worktrees/pre-v11-main`               | Detached HEAD `604c476`, verified ancestor of `main`; no unique work                                       | `git worktree remove` — it was a pre-V11 comparison snapshot; the commit is fully reachable from `main`.                                                                                                                                                                                        |
| Stashes                                          | None                                                                                                       | Nothing to do.                                                                                                                                                                                                                                                                                  |
| Uncommitted                                      | Only `docs/plans/2026-07-04-atproto-shared-spaces-research.md` + this plan (untracked)                     | Commit in Task 0.1.                                                                                                                                                                                                                                                                             |

### Task 0.1: Commit the research report and this plan

**Files:** Create (already written): `docs/plans/2026-07-04-atproto-shared-spaces-research.md`, `docs/plans/2026-07-04-v12-program-plan.md`

- [ ] **Step 1: Verify only the two expected files are untracked**

Run: `git status --porcelain`
Expected: exactly two `??` lines, both under `docs/plans/`.

- [ ] **Step 2: Commit on the current branch**

```bash
git add docs/plans/2026-07-04-atproto-shared-spaces-research.md docs/plans/2026-07-04-v12-program-plan.md
git commit -m "docs: July 2026 shared-spaces research report + V12 program plan"
```

### Task 0.2: Green-build gate on the codex branch

- [ ] **Step 1: Clean install and build**

Run: `pnpm install && pnpm build`
Expected: all packages build; exit 0. If `@coopsource/federation` fails, run `pnpm --filter @coopsource/federation build` first and re-run.

- [ ] **Step 2: Full unit/integration tests**

Run: `pnpm test`
Expected: all suites pass (163 test files; spaces-consumer 34 cases; arbiter-client 14 cases). Record the summary line in the PR/merge notes.

- [ ] **Step 3 (if Docker available): full suite with real PDS**

Run: `make test:all`
Expected: pass. If Docker is unavailable, note "unit-only verification" in the merge commit body.

### Task 0.3: Review pass on the merge diff

- [ ] **Step 1: Run a code review of everything main will receive**

Invoke the `/code-review` skill at high effort over `main..HEAD`. Scope hint for the reviewer: the 8 newest commits (group mutation boundary, consent evidence, directory adapter) are the least-reviewed; the 25 stage-1 commits already passed Wave-1/Wave-2 review.

- [ ] **Step 2: Triage findings**

Fix correctness findings on the codex branch (commit per fix, conventional messages). Defer style/simplification findings to Phase 2 unless trivial. Re-run `pnpm test` after fixes.

### Task 0.4: Merge to main

- [ ] **Step 1: Merge (no fast-forward, keep the branch point visible)**

```bash
git checkout main
git merge --no-ff codex/v11-atproto-alignment-planning -m "Merge V11 substrate: spaces-consumer, arbiter-client, member consent, group mutation boundary

Contains Stage 1 (spaces consumer, flag-gated) and the Stage 2/3 slice
(CSN-DB group directory/mutation adapters, memberConsent lexicon,
consent evidence verifier). Reviewed + full test pass recorded in
docs/plans/2026-07-04-v12-program-plan.md Phase 0."
```

- [ ] **Step 2: Verify main builds and tests green**

Run: `pnpm build && pnpm test`
Expected: identical pass to Task 0.2.

### Task 0.5: Delete/archive branches

- [ ] **Step 1: Delete contained and merged branches**

```bash
git branch -d feature/v11-stage-1-spaces-consumer   # ancestor of merged codex branch
git branch -d codex/v11-atproto-alignment-planning  # now merged
git branch -d chore/opus-4.7-config-upgrade         # merged long ago
git push origin --delete chore/opus-4.7-config-upgrade
```

Expected: all `-d` succeed (they refuse if not merged — that refusal would be a stop-and-investigate signal).

- [ ] **Step 2: Tag and delete the stale V7 branch**

```bash
git tag archive/v7-declarative-hooks feature/v7-declarative-hooks
git branch -D feature/v7-declarative-hooks
```

### Task 0.6: Remove the stale worktree

- [ ] **Step 1: Remove and prune**

```bash
git worktree remove .worktrees/pre-v11-main
git worktree prune
git worktree list
```

Expected: only the primary worktree remains. (`604c476` verified ancestor of `main`; nothing is lost.)

### Task 0.7: Push

- [ ] **Step 1: Push main and tags**

```bash
git push origin main --tags
```

Expected: origin/main advances from `263ffab` past the 11 docs commits + the merge. **Exit criterion for Phase 0:** `git branch -a -v` shows only `main` (+ remotes), clean status, one worktree.

---

## Phase 1 — Documentation sweep + V12 doc set

**Branch:** `feature/v12-phase-1-docs`

**Doc disposition table (verdicts grounded in the July 4 research + code audit):**

| Doc                                                                                   | Verdict                                                                                                                                                             | Action                                                                                                                      |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ARCHITECTURE-V11.md`                                                                 | Superseded (7 weeks stale on upstream; wrong on `ats://`, ECMH, IETF 125, seam mechanics)                                                                           | Archive → `docs/archive/`; content absorbed into V12                                                                        |
| `CLAUDE-CODE-PROMPT-V11.md`                                                           | Superseded; line discontinued per decision log                                                                                                                      | Archive; operational content becomes ARCHITECTURE-V12 "Implementation playbook" section                                     |
| `CLAUDE.md` (547 lines)                                                               | Drifted: describes container registrations that don't exist, spaceType lexicons that don't exist, Opus-4.7-specific guidance, stale pins                            | Rewrite slim (~150 lines)                                                                                                   |
| `AGENTS.md` (7 lines)                                                                 | Current and load-bearing (PoC posture)                                                                                                                              | Keep as-is                                                                                                                  |
| `README.md`                                                                           | Likely stale on architecture references                                                                                                                             | Audit + refresh in place                                                                                                    |
| `DEPLOYMENT.md` (581) / `docs/operations.md` (105)                                    | Overlapping ops content                                                                                                                                             | Verify against `Makefile`/`infrastructure/`; fold operations.md into DEPLOYMENT.md if >50% redundant, else banner-link them |
| `docs/inlay-components.md`, `docs/inlay-developer-guide.md`                           | **Live feature docs** (correction 2026-07-04: `apps/api/src/xrpc/handlers/inlay-*`, `packages/federation` `inlay-auth-verifier.ts` implement V9.3 Inlay components) | Keep; add a status line noting the implementing modules                                                                     |
| `docs/plans/2026-05-08-*`, `2026-05-11-*` (research/direction/addendum/design-review) | Historically valuable, factually superseded on upstream state                                                                                                       | Keep in place; add a one-line superseded banner pointing at the 2026-07-04 report and ARCHITECTURE-V12                      |
| `docs/plans/2026-05-17-*` (5 stage docs)                                              | Executed (their content is now code on `main`)                                                                                                                      | Keep; add "executed — see packages/…" banner                                                                                |
| `docs/plans/2026-03-02-dev-environment-automation-design.md`                          | Verify against current `Makefile`                                                                                                                                   | Banner or refresh                                                                                                           |
| `docs/superpowers/plans/*`, `specs/*` (V7/V8 era + stage-1)                           | Historical execution records                                                                                                                                        | Leave in place (dated, self-describing); add SHELVED banner to `2026-04-11-actor-profile-and-rename.md` (never started)     |
| `docs/archive/*`                                                                      | Already archived                                                                                                                                                    | No action                                                                                                                   |

### Task 1.1: Apply the disposition table

- [ ] ~~Archive Inlay docs~~ Corrected: Inlay is live code (see disposition table); add status lines pointing docs at the implementing modules instead.
- [ ] Add superseded/executed/shelved banners (one `> **Status:** …` line at top of each file listed above).
- [ ] Fold or banner-link `docs/operations.md` ↔ `DEPLOYMENT.md` after diffing their content against `Makefile` targets.
- [ ] Commit: `git commit -m "docs: apply V12 disposition — archive Inlay docs, banner superseded plans"`

### Task 1.2: Write `ARCHITECTURE-V12.md`

Single canonical spec. Required section list (content sources in parentheses):

1. **Δ from V11** — one page: what changed upstream (proposal 0016 merged; `at://…/space/…`; LtHash; three-token credential flow; 16 draft arbiter lexicons; oauth-scopes 0.5.x; pds 0.5.x; IETF ATP WG excludes non-public data — meeting is IETF 126) and what did NOT change (four layers, plugin set, axes, recursive model, fail-closed posture).
2. Four-layer model + three axes (carry from V11 §2–3, corrected terminology: "space authority" ≙ our `arbiterDid`).
3. Spaces substrate (proposal-0016-accurate: space triple, URI shape via helpers, LtHash digest surfaced through the `PermissionedRepoPort` sync/verification boundary, oplog sync `listRepoOps` + CAR fallback, simplespace baseline, reader-side write enforcement as _the_ mechanism).
4. Arbiter integration incl. **the port↔lexicon mapping table** (`GroupDirectoryPort.resolveSpaceMembers` ↔ `town.muni.arbiter.resolveSpaceMembers`, `listSpaces`, `getSpaceConfig`, `getSpaceMembers`; `GroupMutationPort.addMember/removeMember/…` ↔ `createSpace`/`removeSpaceMember`/`setSpaceMemberAccess`; DID provisioning ↔ `createDid`/`updateDidDoc`) and the identity-vs-authorization (Rego) split mapped to Axis 2 vs Axis 3.
5. OAuth-spaces seam (three tokens: delegation token / client attestation / space credential; client allow-deny lists; the three failure modes with axis names).
6. GovernanceView + the ten-plugin `GovernancePluginSet` (verbatim from V11 §9 — unchanged; note initial packages exist and service extraction remains Phase 5).
7. CoopView (from V11, trimmed).
8. Data tiers (Tier 3 still optional — Germ still iOS-only).
9. Security requirements (carry; digest algorithm now "LtHash per proposal 0016, behind port").
10. **Implementation playbook** (absorbs CLAUDE-CODE-PROMPT: current code state per the July 4 audit — what exists, what's flag-gated, what's a CSN-DB stand-in; stage/phase table = this plan's Phases 2–7 with entry/exit gates; branch naming `feature/v12-phase-N-*`).
11. Design commitments (§17 carry, re-affirmed by the graded-forecast table from the research report) and open questions (§18 rewritten: seam mechanics now _known-but-unshipped_; remaining open: arbiter hosting, cross-modality routing, `$publish`/`$labeler` conventions, Lexicon Community sponsorship, Diary 7 sync details).
12. Ecosystem watchlist (same endpoints + `github.com/bluesky-social/proposals`, PR #5187, and the reactivated `github.com/gamesgamesgamesgamesgames/happyview` — the May "GitHub stale, use Tangled" note is outdated; cadence two weeks; next due **2026-07-18**, IETF 126 week). Track whether HappyView 2.10's `read_self` access level and `com.atproto.space.*`/`com.atproto.simplespace.*` NSIDs get confirmed in PR #5187 — first implementation sightings, not yet upstream-normative.

- [ ] Write the doc per the section list; every upstream claim cites the 2026-07-04 research report rather than restating history.
- [ ] Commit: `git commit -m "docs: ARCHITECTURE-V12 — consolidated canonical spec"`

### Task 1.3: Rewrite `CLAUDE.md` slim

Target ≤160 lines. Contents: project one-paragraph + recursive-model paragraph; pointer block (ARCHITECTURE-V12.md is canonical; research report; this plan); the hard rules that must survive verbatim (git workflow incl. merge approval; schema-into-schema.ts; DID/security pitfalls 8–13; Tailwind plugin order; bigint/UUID/cursor notes; stack table with **corrected pins** from Phase 2 findings); build commands; **corrected wiring facts** (container exposes `groupMutations` + `consentEvidenceVerifier`; consumer via `startSpacesConsumer` behind `SPACES_CONSUMER_ENABLED`; no `spacesConsumer`/`arbiterClient`/`governanceView`/`coopView` registrations yet — Phase 5 adds the latter two).

Removals (the "too-restrictive/stale rules" pass — each removal is deliberate):

- "Working with Claude (Opus 4.7)" section — model-specific guidance (tokenizer ratios, effort defaults) is stale and doesn't belong in a repo doc.
- The lexicon-namespace table rows for retired concepts; stale claims that
  `network.coopsource.org.spaceType.*` declarations do not exist. They now exist
  as draft Proposal 0016 space declarations outside generated record schemas.
- Duplicated stage tables/pitfalls now living in ARCHITECTURE-V12 §10 (link instead).
- Keep-but-soften: "Direct URL fetches, not search-driven discovery" becomes "direct fetches of watchlist endpoints first; search to discover _new_ venues" (the July research found proposal 0016's merge via search — the strict rule would have missed it).
- Reframe Pitfall #4: "don't migrate onto HappyView" becomes build-vs-use register row 1 (default build, re-evaluated at Phase 5 with a spike) — per decision-log 5.

- [ ] Rewrite; commit: `git commit -m "docs: slim CLAUDE.md to pointers + hard rules (V12)"`

### Task 1.4: Archive the V11 pair + finish

- [ ] `git mv ARCHITECTURE-V11.md CLAUDE-CODE-PROMPT-V11.md docs/archive/`
- [ ] Refresh `README.md` architecture section (point at ARCHITECTURE-V12.md; correct the four-layer summary; verify quickstart commands against `Makefile`).
- [ ] Full-text sweep for dangling references: `grep -rn "ARCHITECTURE-V11\|CLAUDE-CODE-PROMPT" --include="*.md" --include="*.ts" . | grep -v docs/archive | grep -v node_modules` → fix every hit.
- [ ] Commit and merge to main (autonomous per decision-log 4; `--no-ff`, tag `v12-phase-1`). Flag any contentious doc changes in the merge commit body for the user's later review.

---

## Phase 2 — Substrate drift alignment (small code changes)

**Branch:** `feature/v12-phase-2-drift-alignment`. All tasks TDD; run `pnpm --filter @coopsource/spaces-consumer test` per task.

### Task 2.1: Digest-verification boundary reconciliation

> **2026-07-05 status:** this task did not land as originally written. The current `packages/spaces-consumer` public API has no `EcmhVerifier` or `CommitDigestVerifier`; stale verifier ports were removed/folded into `PermissionedRepoPort`. Future digest work should happen inside a concrete `PermissionedRepoPort` adapter unless a separate verifier boundary becomes necessary.

**Current files:** `packages/spaces-consumer/src/permissioned-repo-port.ts`, `packages/spaces-consumer/src/types.ts`, `packages/spaces-consumer/src/index.ts`, `apps/api/src/appview/spaces-consumer-dispatch.ts`.

- [x] Remove/fold stale verifier exports into the stable public sync boundary.
- [ ] When real LtHash primitives are adopted, add them behind `PermissionedRepoPort.sync(...)` and preserve fail-closed behavior on verification failure.

### Task 2.2: Space-URI helpers

**Files:** Create `packages/spaces-consumer/src/space-uri.ts` + `__tests__/space-uri.test.ts`; export from `index.ts`.

**Interfaces (produces):**

```typescript
export interface SpaceRecordUri {
  spaceDid: string; // space authority DID
  spaceType: string; // NSID
  skey: string;
  authorDid: string;
  collection: string; // NSID
  rkey: string;
}
export function formatSpaceRecordUri(u: SpaceRecordUri): string;
// at://{spaceDid}/space/{spaceType}/{skey}/{authorDid}/{collection}/{rkey}
export function parseSpaceRecordUri(uri: string): SpaceRecordUri | null; // null = not a space URI (plain at:// records included)
```

- [ ] Failing tests first: round-trip; proposal-shaped example (`at://did:plc:abc/space/network.coopsource.org.members/main/did:plc:xyz/network.coopsource.governance.vote/3k2a…`); `parseSpaceRecordUri('at://did:plc:abc/app.bsky.feed.post/xyz')` → `null`; malformed → `null`. Implement; pass; commit `feat(spaces-consumer): at:// space-segment URI helpers per proposal 0016`.
- [ ] Add JSDoc to `SpaceRef` in `types.ts`: "`arbiterDid` is the proposal's _space authority_; we keep arbiter naming to match `town.muni.arbiter.*`." Commit.

### Task 2.3: Dependency currency check

- [ ] `pnpm outdated --recursive | grep @atproto` — record output in the PR description.
- [ ] On this branch, bump `@atproto/oauth-scopes` to `^0.5.3` and attempt `@atproto/pds` `0.5.x` in the dev/test PDS harness; `pnpm install && pnpm build && pnpm test`.
- [ ] If green: keep bumps, update CLAUDE.md pin table (Phase 1 doc gets the final numbers). If red: revert the failing bump, file the breakage as a short note in ARCHITECTURE-V12 §12 watchlist ("pds 0.5 blocked on: …"). Either outcome commits with rationale.

### Task 2.4: Port↔lexicon JSDoc cross-references

**Files:** Modify `packages/spaces-consumer/src/group-directory-port.ts`, `packages/arbiter-client/src/group-mutation-port.ts`, `packages/arbiter-client/src/did-provisioning-port.ts`.

- [ ] Add one JSDoc line per method: `Upstream draft: town.muni.arbiter.<nsid> (lexicon.garden, draft as of 2026-07-04)` using the mapping table from ARCHITECTURE-V12 §4. No behavior change; tests stay green; commit.

### Task 2.5: Pre-merge review cleanup carry-ins

From `docs/plans/2026-07-04-v11-merge-review-findings.md` (verified low-severity cleanup):

- [ ] **V12/URI parsers:** consolidate the three AT-URI parsers (`consent-evidence-verifier` regex, `common/uri.ts`, `federation` split-based) onto the canonical helper from Task 2.2; fix `federation`'s unchecked `parts[2]!` latent crash.
- [x] **V11/orphaned ports:** delete the superseded spaces-consumer set with zero consumers (`RepoPuller`, `NotificationSubscriber`, `ArbiterMemberList`, old verifier/cursor-store sketches); verify `public-api.test.ts` export assertions still hold.
- [ ] **Reuse:** `consent-evidence-verifier` takes `IClock` (not `() => Date`); replace hand-rolled cursor codecs with a shared `packages/common` codec.
- [ ] **Simplify:** remove dead `indexMemberApproval` stub, unused `GroupMutationContext` (re-inline sites should `extends` it), `roleResult` positional-boolean tail → options object, `normalizeRoleSpaceKey` dead `custom/` branch, and the duplicated audit-envelope across the 5 mutating methods.

**Phase 2 exit:** merge to main (autonomous, `--no-ff`, tag `v12-phase-2`); `grep -rn "ECMH" --include="*.ts" packages apps` returns only historical comments that explicitly say "formerly ECMH, now LtHash".

---

## Phase 3 — Arbiter convergence + membership reads through the port (Stage 2/3 completion)

**Entry gate:** none hard (CSN-DB adapters remain the substrate); convergence target is the draft `town.muni.arbiter.*` lexicons. **Re-check before starting:** has Muni Town shipped the promised arbiter server? (watchlist item; if yes, add an integration-test task against it.) **HappyView 2.10 (June 30) is a candidate dev/test harness for the spaces side** — it implements the proposal's endpoint surface (`com.atproto.space.*` / `com.atproto.simplespace.*`, LtHash, `listRepoOps`, `registerNotify`/`notifyWrite`) and could exercise the spaces consumer end-to-end. Reference/harness only — V11 Pitfall #4 (don't migrate onto HappyView) stands.

**Deliverables (superseded where narrower than the July 5 re-plan):**

1. `XrpcGroupDirectoryPort` in `packages/arbiter-client` — done as a non-default, mock-server-tested adapter against the current draft substrate shape (`com.atproto.space.*` / `com.atproto.simplespace.*`). Runtime env selection is deferred until a shipped/stable server and auth/credential posture exist.
2. **Membership reads routed through a designed authority seam — done on the Phase 3 closeout branch.** Do not overload package-level `GroupDirectoryPort` with profiles, quorum, vote weights, or cooperative-specific app semantics; keep Layer 2 generic. The API-layer `MembershipReadModel` composes directory resolution with local projections, and app-level direct `membership`/`membership_role` readers have been removed outside that seam and documented low-level exceptions.
3. Role-space reads (`roles/board`, `classes/<slug>`) via the `roleSpace()`/`parseCsnSpace()` helpers in `arbiter-client/src/space-ref.ts`, replacing remaining direct `membership_role` queries in services where role membership is the authority question.
4. Controlled-DID provisioning aligned to `createDid`/`updateDidDoc` semantics in `did-provisioning-port.ts`.
5. Spaces consumer subscribed to a real space list (replace the `spaces: []` Stage-1 placeholder with per-cooperative `members` + role spaces from the directory).
6. Replay protection per V12 security §: child-still-member check at write acceptance.

**Exit:** membership-read-seam exit is satisfied: no service reads `membership`/`membership_role` tables except through `MembershipReadModel`/low-level exceptions. The remaining consumer-activation exit is separate: `SPACES_CONSUMER_ENABLED=true` in dev still needs to exercise a full notification→pull→cross-check→project loop against fixtures before treating Phase 4 integration as live.

**Pre-merge review carry-ins (from `docs/plans/2026-07-04-v11-merge-review-findings.md`) — resolve in this phase:**

- **V3:** add a suspend/reinstate mutation to `GroupMutationPort` (or formally retire label-based suspension) — `status='suspended'` currently has no writer while the labeler/vote-eligibility still assume it.
- **V5:** emit `member.joined`/`member.departed`/`member.approved` from the membership write path (all `addMember`/`removeMember` callers) — the events are advertised but dead.
- **V10 + A2-1/A2-2/A2-4:** harden the firehose `indexMemberConsent` — verify consent evidence (don't let an unverified self-published record overwrite the join-verified pointer), fix the delete-branch `cid=''` filter, drop the dead `prevCid` branch, and stop counting expected non-member drops as `memberCrossCheckFailures`.
- **V4:** `CsnDbGroupDirectoryPort.resolveSpaceMembers` must compute `partial` from truncation and honor `consistency:'strict'` — today it hardcodes `partial:false`, defeating the consumer's fail-closed guard for >5000-member coops.
- **V9:** consult `did_rotation_history` in the consumer's DID-equality accept path before flipping `SPACES_CONSUMER_ENABLED` on.
- **Read-seam:** done on the Phase 3 closeout branch. The API-layer membership read seam centralizes active/invalidated projection reads and fail-closed strict authority checks where authorization depends on membership.
- **V2:** invitation immediate-active was confirmed by the user on 2026-07-04. Local bootstrap addressee binding and atomic single-use redemption are done; OAuth BYO-DID acceptance is deferred to Phase 4 with the `space:`/OAuth credential seam.

- [x] First task: expand this phase via superpowers:writing-plans into `docs/superpowers/plans/2026-MM-DD-v12-phase-3-arbiter-convergence.md`.

## Phase 4 — Governance onto spaces + the credential seam (Stage 4/5)

**Entry gate:** Phase 3 exit + upstream credential flow usable in _some_ form — either `@atproto/space` from PR #5187 becomes consumable, HappyView 2.10 is sufficient as a harness, or we sketch the three-token flow (delegation token → client attestation → space credential) behind `SpaceCredentialStore` per proposal 0016. Surface to user if the gate is still ambiguous at start. Phase 4 must also resolve the `space:` OAuth scope split (`read` vs `read_self`) and the background-sync credential posture.

**Deliverables:** real `SpaceCredentialStore` implementation (short-lived credentials, refresh-per-batch, rotation on member-list change); proposals/votes/deliberations written via `GovernanceRecordPlacementPort`; `private_record` demoted to projection-only; personal spaces (per-(coop,member)) for Stage 5; axis-named errors across the seam (the three failure modes: scope not granted / not in space / app not authorized for space).

**Progress 2026-07-07:** `KyselySpaceCredentialStore` now backs
`SpaceCredentialStore` with the `space_credential` table and integration tests;
`SpaceCredentialManager` already covers refresh-per-batch, near-expiry refresh,
and member-list-change invalidation. Background sync posture is now documented
as a cooperative-designated managing session pool in
`docs/plans/2026-07-07-v12-phase-4-background-sync-credential-posture.md`.
Remaining credential-seam work is the live issuer/session-selection
implementation and PDS/HappyView exercise.

**Progress 2026-07-30:** The July 29 ecosystem sweep replaced the stale
membership-in-protocol assumptions with a pinned Proposal 0016 conformance
baseline. The code now centralizes every draft XRPC method CSN calls, requests
the narrow SimpleSpace `manage=create,update` grants, resolves authority
service/key entries from the DID document, and provides a deterministic
client-attestation signing port. Runtime storage defaults remain unchanged.
The next critical deliverable is one real notification/sweep/oplog/LtHash/CAR
proposal-and-vote read/recovery slice with cooperative membership applied as a
separate post-verification acceptance policy.

**Progress 2026-07-30, P1 checkpoint:** The concrete draft XRPC reader now
implements `listRepos`/`listRepoOps`, periodic reconciliation, pinned
LtHash/commit verification, CAR recovery, blob verification, persisted
registration/replica state, writer removal, credential refresh, and
post-projection checkpoints. The API projects verified proposal/vote records
idempotently while preserving its query shape and keeping strict CSN
membership as a separate acceptance gate. Runtime reader/writer defaults are
unchanged. Inbound notification endpoint activation and a live upstream
`getRepo` exercise remain parked; see
`docs/plans/2026-07-30-v12-phase-4-permissioned-proposal-vote-consumer.md`.

**Progress 2026-07-30, P1 lifecycle checkpoint:** Raw
`subscribeRepos` identity/account frames and Tap identity state now feed the
spaces consumer after it starts. DID changes force endpoint reconciliation;
host-matched inactive account events persist independently of replica state,
project immediate tombstones, and suppress later sweeps until a newer active
event or host move. Events from another host and unattributed Tap events remain
non-destructive. Runtime defaults are unchanged; production source topology
remains parked. See
`docs/plans/2026-07-30-v12-phase-4-public-repo-lifecycle-events.md`.

**Progress 2026-07-30, differential conformance checkpoint:** The
permissioned reader now has machine-readable profiles and a non-destructive by
default, abort-aware HTTP probe for the unchanged atproto PR #5187 pin and
HappyView `2.12.0-dev.2`. Notification registration is an explicit opt-in.
Upstream executable suites confirm PR #5187's signed commit/oplog path and
unimplemented `getRepo`, plus HappyView's working two-root CAR with unsigned
commits and divergent credential/notification envelopes. Runtime defaults
remain unchanged. See
`docs/plans/2026-07-30-v12-phase-4-permissioned-conformance-differential.md`.

**Progress 2026-07-30, placement-port checkpoint:** Proposal and vote creation
now ask `GovernanceRecordPlacementPort` for a named public-repository or
permissioned-space destination. The old numeric `VisibilityRouter` and its
unused record/actor inputs are removed. `CsnDbGovernanceRecordPlacementPort`
preserves the existing open/mixed/closed policy, and `private-record` remains
the default writer. Managing-app, custody, retention, migration, and default
activation decisions remain open. See
`docs/plans/2026-07-30-v12-phase-4-governance-record-placement-port.md`.

**Progress 2026-07-30, managing-app access checkpoint:** The pinned
service-authenticated `com.atproto.simplespace.checkUserAccess` callback now
routes through a generic Layer 2 policy port. The first CSN adapter authorizes
only fresh, complete, strictly resolved members of the requested CSN space,
binds the verified issuer to the space authority, and otherwise fails closed.
The route is absent by default; production service identity, trusted
authorities, operator availability, and appeal policy require V12-S10 signoff.
See
`docs/plans/2026-07-30-v12-phase-4-managing-app-access-policy.md`.

**Progress 2026-07-30, Tier 2 migration-readiness checkpoint:** A read-only
audit now reconciles active permissioned governance projections against their
physical `private_record` sources in both directions. It reports missing,
invalid, mismatched, and orphaned records without exposing Tier 2 payloads and
has no mutation flag. The writer default and source authority remain
unchanged. A later copy/rollback checkpoint must use a durable ledger and
preserve private sources; V12-S01/V12-S05 remain open. See
`docs/plans/2026-07-30-v12-phase-4-tier2-migration-readiness.md`.

- [x] First task expanded through the July 29 gap analysis and July 30
  conformance-baseline note.

## Phase 5 — GovernanceView + CoopView (Stages 6/7) — _may run in parallel with Phases 3–4_

**Entry gate:** none (explicitly ungated in V11 §16 and still true). The largest purely-CSN-controlled gap.

**Deliverables:**

1. `packages/governance-view`: `GovernancePluginSet` — all ten interfaces (`voteWeight`, `eligibility`, `quorum`, `actionAuthorizer`, `anchorSummary`, `historicalState`, `patronageAllocator`, `surplusDistributor`, `meetingMinutes`, `delegateChains`), async, plain-value inputs, no-op defaults; extraction of generic proposal/vote/delegation logic from `proposal-service`/`delegation-voting-service`.
2. `packages/coop-view`: CSN plugin implementations wired from existing services (member classes → `voteWeight`; patronage service → `patronageAllocator`/`surplusDistributor`; meeting records → `meetingMinutes`).
3. Container registrations `governanceView`/`coopView` (making the doc-described wiring real).
4. Draft `community.lexicon.governance.*` lexicon JSON kept in-repo under `packages/lexicons/community-draft/` (clearly non-canonical) + **ecosystem track:** TSC-sponsorship outreach at the Lexicon Community (gated, slow — start early; Stage 6 does not wait on ratification).

**Status (2026-07-30):** The supported portions of deliverables 1-3 are
implemented as incremental checkpoints, including generic tally/outcome and
proposal-lifecycle policy plus vote, eligibility, quorum, authorization,
delegation, patronage, and distribution adapters. Proposal lookup by ID and URI
now projects its unweighted active-vote summary through the generic tally
reducer. `anchorSummary`,
`historicalState`, and `meetingMinutes` remain deliberately unwired until their
public-summary, durable-snapshot, and canonicalization contracts exist.
The non-canonical proposal, vote, deliberation, summary, log-head, and election
drafts from deliverable 4 are checked in and validation-tested;
TSC-sponsorship outreach remains an outward-facing follow-up requiring user
review. The HappyView 2.11.4 AppView substrate spike is complete and confirms
the build decision; later HappyView 2.11.8/2.12-dev changes strengthen its role
as a differential spaces harness rather than an AppView replacement. Treat
Phase 5 as stable for sequencing. Continue extraction only for plainly pure,
persistence-independent logic with focused contracts; do not start
`anchorSummary`, `historicalState`, or `meetingMinutes` without those
contracts.

- [x] First task: expand into its own task-level plan (completed in `docs/plans/2026-07-06-v12-phase-5-governance-view-interface-design.md`).

## Phase 6 — V9 surface retirement (Stage 8)

**Entry gate:** Phases 3–5 stable on main.

**Checklist (updated 2026-07-30):** `privateRecordService` + `private-record-service.ts` + `private_record` table + `routes/private/records.ts`; `governanceLabeler` (and its `ProposalService` injection); `IFederationClient` + `HttpFederationClient` + `http/signing.ts` (RFC 9421) + `signing-key-resolver.ts`; `cooperative-link-service.ts` + `cooperative_link` table; `local/` PDS/PLC classes (`LocalPdsService`, `LocalPlcClient`, `LocalBlobStore`, local `firehose.ts`, `cooperative-provisioning.ts`); outbox remnants. The legacy `VisibilityRouter` was removed in Phase 4 and replaced by the named `GovernanceRecordPlacementPort`; the default adapter still reads the existing CSN visibility policy. Each remaining removal: delete code + container wiring + schema table + tests in one commit per subsystem; `pnpm build && pnpm test` between commits.

- [ ] First task: expand into a task-level plan (mostly mechanical; the risk is hidden consumers — each subsystem task starts with a `grep -rn` usage sweep).

## Phase 7 — Full UX overhaul

**Entry gate:** Phases 3–4 merged (ATProto work "settled" per user priority). **Exception:** Task 7.1 (read-only audit) may run any time after Phase 1.

**Scope (user decision: full overhaul):**

1. **UX audit** (7.1): dead ends, dismiss traps, buried CTAs, missing empty/error/loading states across all 88 pages; journey maps for the 6 core flows (onboarding/join-a-coop, proposals+voting, membership admin, agreements/signatures, finance/patronage, network directory). Deliverable: findings doc + severity-ranked backlog.
2. **Information architecture restructure**: nav model redesigned around the recursive-cooperative mental model (person ↔ coop ↔ network contexts) rather than the current flat route list; route-group changes in `apps/web/src/routes`.
3. **Distinctive visual direction**: 3 candidate directions (moodboard + 2 key screens each) to replace the generic dark-sidebar Linear look; multi-round design review with user (per established preference) before any implementation; then design tokens (Tailwind 4 theme), typography, color, motion, iconography.
4. **Component/design-system rebuild** on the chosen direction; then page migration in waves (core flows first), each wave shipping the empty/error/loading state sweep for its pages.
5. **Accessibility pass** folded into each wave (focus order, contrast, reduced motion).

**Process requirements:** superpowers:brainstorming before the IA and visual-direction work; frontend-design skill during implementation; Playwright specs updated per wave (84 existing specs are the regression net); no wave merges without user review of screenshots.

- [ ] First task: run the audit (7.1) and write `docs/plans/2026-MM-DD-ux-overhaul-audit.md`; second task: brainstorm + design doc + review rounds; third: expand implementation waves into task-level plans.

## Ongoing track — Ecosystem cadence (parallel to all phases)

- [x] Deep ecosystem sweep completed 2026-07-29 across Proposal 0016,
  atproto PR #5187, Diary 7, HappyView, Roomy/Arbiter, Atmospheric Groups,
  Blacksky, Northsky, Habitat, Colibri, and atproto-crates.
- [ ] Continue the two-week watchlist cadence; **next due 2026-08-12**.
- [ ] Post `resolveSpaceMembers` semantics feedback (depth/partial/staleness — where CSN has real implementation experience) to WG thread t/750. _Outward-facing: draft for user review before posting._
- [x] Diary 7 reviewed. It confirms direct pull, best-effort notifications,
  periodic reconciliation, and no core member roster; its HMAC-only prose
  currently differs from Proposal 0016/PR #5187's signed-context-plus-HMAC
  shape.
- [ ] Lexicon Community TSC-sponsorship inquiry for `community.lexicon.governance.*` (feeds Phase 5.4). _Outward-facing: draft for user review._

---

## Sequencing summary

```
Phase 0 (repo cleanup)                       ──►  1–2 sessions, approval pre-granted
Phase 1 (docs sweep + V12 set)               ──►  2–3 sessions, merge needs approval
Phase 2 (drift alignment)                    ──►  1–2 sessions
Phase 3 (arbiter convergence)  ─┬─ parallel ─┬►  Phase 5 (GovernanceView/CoopView)
Phase 4 (governance→spaces)  ◄──┘            │    (ungated; largest CSN-owned gap)
Phase 6 (V9 retirement)  ◄── after 3–5 stable┘
Phase 7 (full UX overhaul) ◄── after 3–4 merged (audit may start after Phase 1)
Ecosystem cadence: every 2 weeks, next 2026-07-18
```

## Self-review notes (per writing-plans skill)

- **Spec coverage:** user asks mapped — repo cleanup (Phase 0, first, as required), docs redundancy/conflict/staleness pass grounded in code (Phase 1 + disposition table), research-report recommendations (Phases 1–3 + ecosystem track: all 6 recommendations have homes), push forward (Phases 3–6), UI/UX after ATProto (Phase 7 + gate), V12 docs (Task 1.2–1.4), questions asked (decision log).
- **Placeholder scan:** Phases 3–7 are deliberate phase-specs with expansion tasks, not placeholders inside executable tasks; Phases 0–2 have exact commands/paths/code.
- **Consistency:** `PermissionedRepoPort` is the actual public watch/sync/verification boundary; `GroupDirectoryPort`/`GroupMutationPort` names match actual code (`packages/spaces-consumer/src/group-directory-port.ts`, `packages/arbiter-client/src/group-mutation-port.ts`).
