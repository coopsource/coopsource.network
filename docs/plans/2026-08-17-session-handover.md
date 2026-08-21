# Session Handover — Co-op Source Network audit remediation

- **Written:** 2026-08-17, at the close of audit tranche 3
- **State of `main`:** `50a968f`, working tree clean, **56 commits unpushed**
- **Program:** the ordered backlog in
  [2026-08-02 closeout §3](./2026-08-02-audit-tranche-1-closeout-and-handover.md)

This document is a pointer and a method note. It deliberately does **not**
restate what shipped — that lives in the closeout register, which is amended
after every tranche and is the single source of truth for what is done, what is
open, and what a "fixed" label does not cover.

---

## 1. The one constraint that is not negotiable

**Do not push. Ask first, every time.**

`github.com/coopsource/coopsource.network` is **public** (verified: an
unauthenticated API request returns 200). The 56 unpushed commits include
`docs/plans/2026-08-02-independent-deep-review.md` and the closeout register,
which carry reproduction-grade write-ups of criticals that are **still open** —
C-05, C-06/N-3/N-4, S-08, and the unreviewed `apps/api/src/ai/` surface. Pushing
publishes working exploit descriptions for unfixed defects.

The user's decision (2026-08-03, reaffirmed since) is to hold. Nothing about a
green suite or a finished tranche changes it. CI exists
(`.github/workflows/ci.yml`, added in tranche 2) but **has never executed**,
because executing it requires a push — treat its first real run as a debugging
session, not a formality.

## 2. Read these, in this order

1. **[2026-08-02 closeout and handover](./2026-08-02-audit-tranche-1-closeout-and-handover.md)**
   — §1 what shipped per tranche, **§2 "Known-incomplete — read before trusting a
   fix"**, §3 the ordered backlog, §4 open decisions, §5 standing constraints.
   §2 is the section people skip and should not: it is where partial fixes are
   recorded, and after three tranches it is long for good reason.
2. **[docs/agent-learnings.md](../agent-learnings.md)** — §1 (review and
   verification traps) first. Every entry cost someone real time.
   Companions: [agent-debugging-playbook.md](../agent-debugging-playbook.md),
   [agent-testing-practices.md](../agent-testing-practices.md).
3. **[2026-08-02 independent deep review](./2026-08-02-independent-deep-review.md)**
   — the N-1..N-24 series. Note the numbering hazard in §4 below.
4. **[2026-07-31 audit](./2026-07-31-complete-codebase-audit-and-refactor-plan.md)**
   — canonical but **not normative**: it contains verified false positives, dead
   code cited as evidence, and severities that assume a disabled flag is on.

## 3. What to do next

**C-06 + N-3 + N-4** — closeout §3 item 4. The only findings that create or
destroy money under ordinary single-user operation:

- two concurrent $100 redemptions against a $100 balance both succeed;
- three identical patronage POSTs yield a 240 balance for a $100 surplus — root
  cause is `NULLS DISTINCT` on a nullable column in the UNIQUE constraint, **not**
  a type mismatch (the audit's stated cause is wrong; see agent-learnings §4);
- an approved expense can be raised past review and double-reimbursed, because
  no status compare-and-set guards the transition.

Then C-05 (fix at `pipeline.ts`, not `loop.ts` — `processFirehoseEvent` absorbs
errors internally, so a `loop.ts`-only change does nothing; bundle O-12's
dead-letter retry), then S-08 (root is `packages/common/src/did-web.ts`; wire the
existing `url-validation.ts` in with `redirect: 'manual'` and post-resolution IP
checks).

Concurrency findings differ from tranche 3's authorization findings in one way
that matters: **a green suite proves almost nothing about a race.** Plan to
drive genuine concurrent requests and to loop until failure rather than sampling
clean runs.

## 4. Hazards specific to picking this up cold

- **The `N-` series runs to N-24, not N-22.** Tranche 3 numbered a new finding
  N-23 without checking, collided with the still-open API-token-scopes finding,
  and had to renumber to **N-25** across ten code sites, four config/doc sites,
  and three commit subjects. **The next free number is N-26.** Check before you
  label.
- **`main` is 56 commits ahead of `origin`.** Any tooling that assumes
  `origin/main` is current — including a naive `git log origin/main..HEAD`
  sanity check — will mislead you.
- **The SDD workspace is gitignored scratch.** `.superpowers/sdd/<plan>/` holds
  the per-task ledger, briefs, reports, and review diffs for the tranche in
  flight. It survives restarts but not `git clean -fdx`. The durable record is
  git history plus the register.
- **`pnpm format:check` fails on 128 files repo-wide** and did so before any of
  this work (measured with `git stash`). Not your regression; do not "fix" it as
  a side quest inside a security tranche.

## 5. The method that has worked

Three tranches, and the same shape each time:

1. **Re-derive the finding before funding work on it.** Neither C-04 nor A-07
   had an executable probe anywhere in the audit record; both turned out to be
   real, but the probes also corrected the details. Write a throwaway `zz-`
   probe, capture its output into the fix commit's body, delete the probe. Do
   not commit an intentionally-red test.
2. **One task per commit, each with its own review, and a fix loop when the
   review finds something.** Every review gets the diff as a file plus the
   task's brief; reviewers are told not to trust the implementer's report.
3. **Adversarial design review catches design gaps; only implementation plus
   code review catches composition seams.** Tranche 3's two worst findings — a
   cross-cooperative scoping bug and a self-service minting loop where two
   individually-correct gates composed into an exploit — were both invisible to
   two rounds of design review and surfaced only against real code.
4. **Make the reviewer prove the test detects its target.** The final A-07
   regression test was accepted only after deliberately breaking the line it
   guards and observing it go red for the right reason. A regression test that
   cannot detect its regression is decoration.
5. **Externalise state continuously.** The ledger is what survives a restart, a
   compaction, or a killed agent. Two restarts happened mid-tranche and cost
   nothing.

## 6. Bootstrap prompt

```text
Continue the Co-op Source Network audit remediation in
/Users/alan/projects/utm/vmshared/coopsource.network (never ~/projects/coopsource.network,
which is a stale clone).

READ FIRST, in order:
1. docs/plans/2026-08-17-session-handover.md — start here; it points at everything else.
2. docs/plans/2026-08-02-audit-tranche-1-closeout-and-handover.md — §2 (what is only
   partially fixed) and §3 (the ordered backlog). This register is the source of truth.
3. docs/agent-learnings.md §1 — the verification traps that produced the most wasted work.

STATE: tranches 1-3 are merged to local main (50a968f). Tranche 3 closed C-04 (federation
signature forgery) with A-07 and N-25. main is 56 commits ahead of origin.

DO NOT PUSH. The repo is public and the unpushed history contains reproduction-grade
write-ups of still-open criticals. Ask before any push, every time.

NEXT: closeout §3 item 4 — C-06 + N-3 + N-4, the money bugs (concurrent-redemption race,
patronage inflation via NULLS DISTINCT, expense double-reimbursement with no status CAS).
Plan it before implementing, and re-derive each finding with an executable probe first —
the audit is not normative and has been wrong about root causes before.

DO NOT trust a green suite as proof, and note that for concurrency findings a green suite
proves even less than usual: drive real concurrent requests and loop until failure rather
than sampling clean runs.
```
