# Session Handover Prompt — Refactor Program Continuation

- **Date:** 2026-08-01
- **Handing over from:** the assessing session that verified the 2026-07-31 audit and produced the amended refactor program.

## How to start the next session

1. Launch Claude Code with working directory **`/Users/alan/projects/utm/vmshared/coopsource.network`** (critical — this loads the correct V12 CLAUDE.md; the clone at `~/projects/coopsource.network` is 475 commits behind with a stale V5 CLAUDE.md and must not be used).
2. The repo should be on `main` at `9c7a496` with five untracked docs (listed below). Paste the bootstrap prompt from the next section as your first message.

## Bootstrap prompt

```text
Continue the audit-and-refactor program for Co-op Source Network. State handover from the previous session follows.

FIRST ACTION — preserve the untracked docs (data-loss risk):
Create branch docs/complete-codebase-audit-2026-07-31 from main@9c7a496 and commit, in this order:
1. docs/plans/2026-07-31-complete-codebase-audit-and-refactor-plan.md + docs/rag/zicklag-atproto-work.md
   ("docs: add 2026-07-31 complete codebase audit and reference notes")
2. docs/plans/2026-08-01-audit-assessment-and-refactor-program.md
   ("docs: adopt 2026-07-31 audit with verification results and amended refactor program")
3. docs/plans/2026-08-01-approved-handover-plan.md + docs/plans/2026-08-01-session-handover-prompt.md
   ("docs: add session handover prompt for refactor-program continuation")
Do NOT merge to main (explicit user approval required), do NOT delete branches, do NOT push unless asked.

THEN READ, in order:
1. docs/plans/2026-07-31-complete-codebase-audit-and-refactor-plan.md — the canonical audit + remediation program (Gate 0 + Phases 1-8). Adopted; do not re-litigate.
2. docs/plans/2026-08-01-audit-assessment-and-refactor-program.md — verification verdict (22/22 findings CONFIRMED, per-finding evidence table), live ecosystem refresh, amendment register AM-1..AM-8, decision register, approval gates, pinned sources.
3. docs/rag/zicklag-atproto-work.md — user-curated reference links (Arbiter/Roomy/Muni Town).

STATE SUMMARY:
- Audit verified 22/22 sampled findings on main@9c7a496 (all 6 criticals; several findings worse than reported — see the assessment doc). The report's conclusion stands: not safe to deploy or operate as documented.
- The report is adopted as the canonical program; the assessment doc amends it (AM-1..AM-8).
- NO implementation is authorized yet.

LOCKED DECISIONS (user, 2026-08-01):
- Scripting: keep the feature, but isolate properly (AM-1). Gate 0 still disables it immediately; in-process node:vm is never re-enabled.
- Delegation: immutable per-proposal snapshot, represented power computed at close, each member counted exactly once (AM-2).
- Authority hosting direction: conformance with the official com.atproto.simplespace.* surface as pilot target (AM-4); CsnDbGroupDirectoryPort remains default meanwhile.
- All work in this clone only; leave ~/projects/coopsource.network untouched.

STANDING CONSTRAINTS:
- Feature branches only; never merge to main without explicit approval; never delete branches.
- Keep SPACES_CONSUMER_ENABLED=false outside conformance environments.
- Treat Proposal 0016 / PR #5187 as an executable draft, never a stable dependency. It moved 3 times in the 48h before handover; last observed head c5962d7ab23d0f42ccb835e7014a9d38f24ad002 (84 commits). Before ANY Phase 6 work, re-check the live head and re-run the freshness checks in the assessment doc's sources appendix (PR state, proposal path commit, npm versions, HappyView releases, Discourse topics 946/968/976).
- Do not bake space-URI shapes into storage keys or lexicons while at:// vs ats:// is unresolved (AM-7); SpaceRef stays behind ports.

IMMEDIATE NEXT ACTIONS (in order):
1. Ask the user to approve the first implementation tranche — the report's Gate 0 + P0 set: public-governance acceptance gate (C-01), role-assignment ceiling (S-01), invite enforcement (S-02), request-log redaction (S-03), payment-webhook scoping (S-06), script-route disable (C-02) — with regression tests, on a feature branch.
2. Collect the open decisions from the assessment doc's decision register, each before its blocking phase: #3 governance record model (blocks Phase 2), #4 admission default (Phase 1), #5 finance visibility (Phase 1), #6 migrations policy (Phase 7), #7 OAuth resource server (Phase 2), #9 Tier 2 retention/deletion (Phase 5/6), #10 network joining approval (Phase 1).
```

## Session log (what the assessing session did)

1. Located the audit report — it existed only as an untracked file in this clone (the session's own cwd was the stale `~/projects` clone, where the report's path does not exist). Read all 1,534 lines.
2. Ground-truthed 22 findings (all 6 criticals, 6 ATProto, 10 security/logic/ops/web) via three independent read-only verification passes over a `git archive` snapshot of `9c7a496`, plus two direct spot-checks. Result: 22/22 CONFIRMED, several worse than reported, one new gap found (wire-dialect registry unused by adapters).
3. Ran a live ecosystem refresh (2026-08-01) against primary sources: GitHub API (PR #5187, proposals repo, HappyView, Habitat, Stratos, rsky), npm, Atmosphere Discourse JSON API, leaflet posts (dholms, zicklag, bnewbold), atproto.com roadmap. All report claims verified accurate at its cutoff; post-cutoff deltas recorded in the assessment doc (new PR head, simplespace surface, HappyView dev.3, Habitat adoption, new forum objection).
4. Collected user decisions via Q&A: scripting keep-but-isolate; delegation snapshot-at-close; plan-only scope; vmshared clone as execution target; stale clone left alone; new session for all further work.
5. Wrote the assessment/program document, this handover set, and the approved-plan record. Made **no** git changes, **no** code changes, and touched nothing in the stale clone. Git work (branch + commits above) deferred to the next session at the user's direction.
