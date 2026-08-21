# Session Handover — Spaces-alpha sweep & Phase 4A setup

- **Written:** 2026-08-21, at the close of the 2026-08-20 spaces-alpha session
- **State of `main`:** `3063546`, working tree clean, **63 commits unpushed**
- **This track's record:** `docs/plans/2026-08-20-spaces-alpha-impact-analysis.md`
  (the reviewed revision — merged `25f53dc`, corrected `3063546`)
- **The other in-flight track:** audit remediation —
  [2026-08-17 handover](./2026-08-17-session-handover.md) is still valid and
  is not superseded by this document.

This document is a pointer and a hazard list. It deliberately does **not**
restate what the alpha changed or what Phase 4A contains — the impact
analysis is the single source of truth for that, and it was adversarially
reviewed (three independent reviewers) before being trusted. What follows is
only what a cold start cannot reconstruct from it.

---

## 1. The one constraint that is not negotiable

**Do not push. Ask first, every time.** Unchanged from the audit handover §1,
and this session added 5 more unpushed commits (2 no-ff merges + 3 doc
commits). `origin/main..HEAD` reasoning misleads at 63 ahead.

## 2. Read these, in this order

1. **[2026-08-20 impact analysis](./2026-08-20-spaces-alpha-impact-analysis.md)**
   — §0 for the verdict, §5 for the Phase 4A items (full detail lives here,
   not in the plan), §9 for the execution order, §4-5 for the managing-app
   security preconditions. Read the **Revised** header note: this is the
   post-review version; trust it over any session summary.
2. **The Phase 4A checkbox block** in
   [the program plan](./2026-07-04-v12-program-plan.md) (Phase 4 section,
   "2026-08-20 — Phase 4A") — the executable task list, 4A.0–4A.9.
3. **ARCHITECTURE-V12 §12** — current pins, the corrected open-questions
   dispositions, and the weekly-watch definition.
4. If work touches inbound surfaces, tokens, or money paths:
   [the audit handover](./2026-08-17-session-handover.md) and the closeout
   register's §2 first. Phase 4A deliberately defers to it in two places
   (A-06, S-08).
5. `docs/agent-learnings.md` §1 before debugging anything that "should work".

## 3. What to do next

**Track priority:** the audit track (C-06 + N-3 + N-4, the money bugs) is
the standing next work per its handover. This spaces track does **not**
preempt it; the user chooses which resumes. When it is spaces:

- **4A.0 first:** expand Phase 4A into a task-level plan
  (superpowers:writing-plans →
  `docs/superpowers/plans/2026-MM-DD-v12-phase-4a-spaces-alpha-alignment.md`),
  carrying the item detail from analysis §5 — the plan's checkboxes are
  summaries, §5 is the specification.
- **Then the §9 order, not the item numbering:**
  4A.1 (repin) → **4A.7 (oracle — its `createDpopProof` output is DPoP's
  fixture generator)** → 4A.2–4A.4 → 4A.6 → 4A.5, 4A.8, 4A.9.
- Branch `feature/v12-phase-4a-<desc>`; one reviewed commit per task where
  feasible (4A.2 and 4A.5 may split); TDD.

**Independent of track choice:** the weekly watchlist check is due
**2026-08-27** (upstream ships Thursday drops). It is a *light pass* —
read the atmosphere.community announcements thread, diff the four pins
(proposal / atproto branch / npm snapshot / PDS image), note deltas in
ARCHITECTURE-V12 §12. Escalate to a deep sweep only on a breaking drop or a
spec-level change (commit format, credential model, sync methods).

## 4. Hazards specific to picking this up cold

- **The pins are the target, not upstream HEAD.** Conformance pins:
  proposal `54c9cf5`, atproto `89deb9fac` (branch `permissioned-data`), npm
  snapshot `0.0.0-spaces-alpha-20260818163953`, image
  `ghcr.io/bluesky-social/atproto:pds-spaces-alpha`. The local evidence
  clones live under `~/projects/utm/vmshared/bluesky/bluesky-social/`
  (`proposals`, `atproto`, `bulletin`, plus `atproto.com`, `indigo`,
  `social-app` — the latter three were not part of the analysis). By the
  time you read this, upstream has probably shipped a Thursday drop and the
  clones may have been re-pulled — **build against the recorded pins**
  (alpha-churn rule, analysis §5) and move the pin only as its own 4A.1-style
  commit.
- **npm `latest` is a trap on the alpha packages.** `@atproto/space`'s
  `latest` dist-tag points at an *earlier* same-day build than `alpha`.
  Install by exact snapshot version, never by `latest` or a range.
- **Phase 4A item numbers ≠ execution order.** 4A.7 runs second, 4A.5 near
  last. The plan block states the order; do not "fix" the numbering — the
  numbers are stable references used by the analysis, ARCHITECTURE-V12 §12,
  and memory.
- **Do not re-add the `notifyWrite` "delta".** The rev+hash payload was
  already required at the July pin; the review pass removed it as a change
  (it survives in 4A.1 as "verify only"). It looked like a delta to a
  spec-diff reading and was refuted only against `git show 3f6c96d5:…` —
  the kind of error that will look plausible again.
- **The dev-JWT harness path is verified, not speculative.** Legacy/dev
  access tokens complete the full credential two-hop in the reference
  handlers (`assertSpaceScope` passes non-OAuth credentials;
  `getSpaceCredential` authenticates by delegation token + DPoP alone).
  Don't re-litigate it — but A-06 still gates the real-OAuth path (register
  re-grade: "gates any real-PDS exercise"), and the real-OAuth path is the
  production-shaped one.
- **DPoP work (4A.2) has a security decision inside it**: the persisted
  credential store would start holding private keys. The custody options are
  listed in analysis §5 item 2; pick one deliberately, don't default into
  plaintext keys in Postgres.
- **New inbound surfaces wait on S-08.** Both the managing-app callback and
  the 4A.8 notification endpoint resolve caller DIDs; analysis §4-5 has the
  preconditions. Design may proceed; activation may not.
- **Environment leftovers:** the `infrastructure/docker-compose.yml`
  services (plc, pds) were left running on 2026-08-20 after the merge gates.
  `pnpm format:check` still fails on 128 files repo-wide (pre-existing; not
  yours to fix mid-task). 34 pre-existing merged-but-undeleted local
  branches remain (this session's two were deleted); flagged as
  housekeeping, deliberately not done.
- **Evidence location:** the four ingest-agent reports and three reviewer
  reports live only in the 2026-08-20 session transcript. The docs are
  self-sufficient — every load-bearing claim carries its pin or file
  reference — so nothing requires the transcript. The rendered report is a
  private artifact:
  `https://claude.ai/code/artifact/b4c8173e-ee4a-4bbb-9a6d-7b5a5181cc4b`
  (update via the same URL, don't republish fresh).

## 5. Method notes worth keeping

1. **Primary sources beat search summaries.** The only refuted facts in the
   analysis (A2A version history) came from a web-search summary; every
   claim verified against local clones, npm, or the spec's git history held.
   Treat search results as leads to a primary source, not as citable fact.
2. **Falsify a claim → grep for it everywhere.** §12 was corrected while §3
   still asserted the old world three screens up; the same happened between
   the arch doc and the plan (TSC gate, cadence dates). After changing any
   canonical claim, sweep all four canonical docs for its other statements.
3. **Adversarial review of your own analysis works, with roles split.**
   Fact-check (refute against sources), consistency (diff the docs against
   the code and each other), and judgment red-team found disjoint problems;
   the two most important findings (managing-app preconditions, the
   dev-dep/runtime contradiction) were exactly the ones a later executor
   would have hit literally. Reviewers were told not to trust the document;
   findings were re-verified before adoption, and one red-team caveat was
   rejected on the fact-checker's stronger evidence.
4. **The tier table is a classifier — use it on new proposals.** The A2A
   non-goal contradicted the flagship use case because "agreement drafts"
   are Tier 2 by ARCHITECTURE-V12 §8's own text. Classify payloads before
   proposing transports.

## 6. Bootstrap prompt

```text
Resume the Co-op Source Network spaces-alpha track in
/Users/alan/projects/utm/vmshared/coopsource.network (never
~/projects/coopsource.network, which is a stale clone).

READ FIRST, in order:
1. docs/plans/2026-08-21-session-handover-spaces-alpha.md — start here; it
   points at everything else and lists the cold-start hazards.
2. docs/plans/2026-08-20-spaces-alpha-impact-analysis.md — §5 (Phase 4A item
   detail) and §9 (execution order). This is the adversarially reviewed
   revision; trust it over any summary.
3. The Phase 4A checkbox block in docs/plans/2026-07-04-v12-program-plan.md.

STATE: main @ 3063546, clean, 63 commits unpushed. The ATProto Spaces alpha
shipped 2026-08-20; the impact analysis and doc corrections are merged.
Upstream ships breaking drops on Thursdays.

DO NOT PUSH. The repo is public and unpushed history contains
reproduction-grade write-ups of still-open criticals. Ask before any push,
every time.

TRACK PRIORITY: the audit track (C-06+N-3+N-4; its own handover is
docs/plans/2026-08-17-session-handover.md) is the standing next work unless
I say spaces. For the spaces track:

NEXT: 4A.0 — expand Phase 4A into a task-level plan
(superpowers:writing-plans → docs/superpowers/plans/), carrying §5's item
detail. Then execute in the §9 order: 4A.1 (repin) → 4A.7 (oracle, before
DPoP — its proofs are DPoP's fixtures) → 4A.2–4A.4 → 4A.6 → 4A.5, 4A.8,
4A.9. Branch feature/v12-phase-4a-<desc>; one reviewed commit per task
(4A.2/4A.5 may split); TDD.

CONSTRAINTS: build against the recorded pins (proposal 54c9cf5, atproto
89deb9fac, npm 0.0.0-spaces-alpha-20260818163953 — exact version; the
`latest` dist-tag is an older build), and if a Thursday drop lands
mid-package, finish in-flight items on the existing pin and batch the repin
separately. 4A.2 contains a key-at-rest custody decision — make it
deliberately. A-06 gates the real-OAuth harness path; the dev-JWT two-hop is
verified and is the interim. New inbound DID-resolving surfaces (managing-app
callback, 4A.8 endpoint) do not ACTIVATE before S-08 closes — design only.
Do not renumber Phase 4A items to match execution order. The weekly
watchlist check (due 2026-08-27) is a light pass, not a sweep.
```
