# Approved Handover Plan (Record)

> **Status note (2026-08-01):** This plan was approved by the user on 2026-08-01. Its git steps — creating branch `docs/complete-codebase-audit-2026-07-31` and making three commits — were **deferred to the next session** at the user's direction; this session wrote files only. The assessment document specified in Task 2 has already been written: [2026-08-01-audit-assessment-and-refactor-program.md](./2026-08-01-audit-assessment-and-refactor-program.md). The bootstrap prompt specified in Task 3 exists as [2026-08-01-session-handover-prompt.md](./2026-08-01-session-handover-prompt.md). The next session's first action is executing the deferred git steps (extended to cover all five untracked docs, including this record and the handover prompt).

---

# Audit Assessment + ATProto Spaces Alignment — State Handover Plan

**Goal:** Persist the assessing session's complete state — audit verification results, live ecosystem research, user decisions, and the amended refactor program — into `docs/plans/`, plus a bootstrap prompt so a fresh session (launched with the correct cwd) continues exactly where it left off. **All further work happens in that new session.**

**Relationship to the 2026-07-31 report's own plan:** the report is adopted **by reference** as the canonical audit and remediation program (Gates 0–8). Nothing here restates or replaces it; the assessment document layers verification results, ecosystem deltas, and an amendment register on top of it.

**Architecture:** No code changes. Documents in `docs/plans/`, plus preserving currently-untracked audit artifacts, committed on a docs branch in the vmshared clone.

**Tech Stack:** git, markdown. Target repo: `/Users/alan/projects/utm/vmshared/coopsource.network` (main @ `9c7a496`).

## Global Constraints

- **All work on feature branches; never merge to `main` without explicit user approval; never delete branches** (repo CLAUDE.md rules).
- **Execution sessions MUST be launched with cwd = `/Users/alan/projects/utm/vmshared/coopsource.network`** — the assessing session's cwd clone (`~/projects/coopsource.network`) is 475 commits behind and injects a stale V5-era CLAUDE.md. Leave the stale clone alone (user decision).
- **User decisions (locked in):** scripting = keep but properly isolate (NOT delete); delegation = snapshot-at-close, each member counted once; scope = plan/program document only, no implementation tranche authorized; target repo = vmshared clone.
- The untracked report `docs/plans/2026-07-31-complete-codebase-audit-and-refactor-plan.md` and `docs/rag/zicklag-atproto-work.md` exist only in the working tree — they must be committed before anything else (data-loss risk).

## Task 1: Preserve audit artifacts on a docs branch

In the vmshared clone: verify clean state at `9c7a496`; create branch `docs/complete-codebase-audit-2026-07-31` (name matches the report's own "Audit branch" header field); add and commit verbatim (no edits):

- `docs/plans/2026-07-31-complete-codebase-audit-and-refactor-plan.md`
- `docs/rag/zicklag-atproto-work.md`

Commit message: `docs: add 2026-07-31 complete codebase audit and reference notes`

## Task 2: The assessment + amended program document

`docs/plans/2026-08-01-audit-assessment-and-refactor-program.md` — **already written.** Required contents (all present): header pinning baseline `9c7a496` and ecosystem cutoff 2026-08-01; assessment verdict with the 22-row per-finding verification table and the worse-than-reported list; ecosystem refresh with the ground-truth `com.atproto.space.*` / `com.atproto.simplespace.*` lexicon inventory at PR head `c5962d7`; program adoption by reference; amendment register AM-1..AM-8; decision register for all 10 report decisions; approval gates (no tranche authorized); pinned sources appendix.

Commit message: `docs: adopt 2026-07-31 audit with verification results and amended refactor program`

## Task 3: The next-session bootstrap prompt

`docs/plans/2026-08-01-session-handover-prompt.md` — how to start the next session; a paste-ready bootstrap prompt (read order, state summary, locked decisions, standing constraints, immediate next actions); brief session log.

Commit message: `docs: add session handover prompt for refactor-program continuation`

## Task 4: Hand back

Present the branch to the user. Do **not** merge to `main` (repo rule: explicit approval required). Do not push unless the user asks.

## Verification

- `git log --oneline main..docs/complete-codebase-audit-2026-07-31` shows the docs commits; `git status` clean; `main` untouched at `9c7a496`.
- Documents render as valid markdown; every pin/URL in the sources appendix matches the recorded values.
- The stale clone `~/projects/coopsource.network` shows no changes.
- User read-through of the amendment + decision registers confirms the recorded decisions match their choices (scripting isolate, snapshot-at-close, plan-only, vmshared).
