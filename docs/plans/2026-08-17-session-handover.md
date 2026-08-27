# Session Handover — Co-op Source Network audit remediation

- **Written:** 2026-08-17, at the close of audit tranche 3
- **Updated:** 2026-08-27, at the close of audit tranche 6 (S-08)
- **State of `main`:** tranches 1-6 merged; pushes are routine (see §1)
- **Program:** the ordered backlog in
  [2026-08-02 closeout §3](./2026-08-02-audit-tranche-1-closeout-and-handover.md)

This document is a pointer and a method note. It deliberately does **not**
restate what shipped — that lives in the closeout register, which is amended
after every tranche and is the single source of truth for what is done, what is
open, and what a "fixed" label does not cover.

---

## 1. The one constraint that is not negotiable

> **Lifted 2026-08-26 (Alan):** pushes are authorized and routine again —
> Alan synced `origin/main` himself and removed the directive, clarifying
> its origin: it dated from a period when pushes failed repeatedly (an
> issue on his end there was no time to fix), compounded by the disclosure
> concern below. Consequences are now live: the write-ups of the still-open
> criticals (C-06/N-3/N-4, C-05, S-08) are published on the public repo —
> this track's urgency is up — and CI executed for the first time on Alan's
> 2026-08-21 push and **passed** (8m3s), so the first-run warning below
> resolved without drama. The rest of this section is the historical record.

**Do not push. Ask first, every time.** *(historical — lifted above)*

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
   recorded, and after four tranches it is long for good reason.
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

**N-1** — closeout §3 item 7. `GET /api/v1/cooperative` returns an *arbitrary*
cooperative: no actor predicate, no `ORDER BY`. The settings page can read one
co-op and write another, including its public-visibility flags, and 28 other
`+page.server.ts` files inherit the wrong identity. The canonical value already
exists and is ignored (`system_config.cooperative_did`).

Then **N-2** (the MCP endpoint — its transport fix and its cross-tenant data
leak must ship in one commit, or fixing the transport ships a cross-tenant
search primitive), **N-16/N-17** (api_token never re-checks membership), and the
unreviewed `apps/api/src/ai/` surface.

### Closed 2026-08-27 — tranche 6 (item 6, SSRF)

S-08 is fixed (`5274481`); plan and probe evidence in
[the tranche-6 plan](./2026-08-27-audit-tranche-6-ssrf-plan.md). Carry forward:

- **It was unauthenticated.** DID resolution happens before signature
  verification by construction, and everything checked first is computable by
  the caller. Worth remembering when reasoning about any other "verified peer"
  path: the verification cannot gate the lookup the verification needs.
- **N-29 filed:** the spaces-consumer's outbound endpoints were in S-08's
  evidence and are **not** fixed. Flag-gated off today. **The next free number
  is N-30.**
- **DNS rebinding is not closed**, deliberately — see the register §2.

### Closed 2026-08-27 — tranche 5 (item 5, AppView delivery)

C-05 and the dead-letter half of O-12 are fixed (`7b16d43..3e346fc`); plan and
probe evidence in
[the tranche-5 plan](./2026-08-27-audit-tranche-5-appview-delivery-plan.md).
Carry forward:

- **O-12 is only half closed.** The outbound webhook outbox still has no
  producer and no delivery worker — item 21.
- **N-28 filed:** nothing watches the dead-letter queue. Now that failures are
  recorded rather than swallowed, that queue *is* the signal something is being
  lost, and nothing reads it. **The next free number is N-29.**
- **A commit body in this tranche corrects an earlier one.** `7b16d43`
  justified its design with a claim that measurement disproved; `3e346fc` says
  so explicitly and fixes the gap. If you read `7b16d43` alone you will get the
  wrong idea — the register's tranche-5 entry has the corrected version.

### Closed 2026-08-26 — tranche 4 (item 4, the money bugs)

C-06, N-3, and N-4 are fixed on `main`
(`3878630..24340ee`); plan and probe evidence in
[the tranche-4 plan](./2026-08-26-audit-tranche-4-money-integrity-plan.md).
Two things a reader should carry forward:

- **The audit understated C-06.** Its stated broken state was the account row
  looking correct. Measured, 3–6 of 8 concurrent `$100` redemptions against a
  `$100` balance were *accepted*, each writing its own ledger row, while the
  lost update left the account reading `balance=0, total_redeemed=100` — so the
  ledger and the balance disagreed by up to `$400` and the row hid it.
- **Two new findings were filed: N-26 and N-27.** N-26 is the big one for
  anyone writing route-level tests: `test-app.ts` mounts **19 fewer route
  modules than production**, so those surfaces have no coverage at all and a
  404 from the test app may mean the route was never mounted. **The next free
  number is N-28.**

Concurrency findings differ from tranche 3's authorization findings in one way
that matters: **a green suite proves almost nothing about a race** — and
tranche 4 measured a sharper version of that. A concurrency test written to
catch the exact defect it targets passed **3/3** against the broken code,
because `supertest` request ordering is stable enough that "concurrent" does
not mean "every interleaving". Measure a pin's detection rate against the
pre-fix code, or make the interleave deterministic (Kysely's `transformResult`
is an async seam for exactly this — see agent-learnings §2).

## 4. Hazards specific to picking this up cold

- **The `N-` series does not start where you think.** The deep review runs
  N-1..N-24; tranche 3 added **N-25** (after a collision that cost a rename
  across ten code sites, four config/doc sites, and three commit subjects);
  tranche 4 added **N-26** and **N-27**, tranche 5 added **N-28**, tranche 6
  added **N-29**. **The next free number is N-30.** Check before you label.
- **`test-app.ts` is a second router as well as a second container.** If a
  route 404s inside a test, check that `test-app.ts` mounts it before
  debugging the route (N-26).
- **The SDD workspace is gitignored scratch.** `.superpowers/sdd/<plan>/` holds
  the per-task ledger, briefs, reports, and review diffs for the tranche in
  flight. It survives restarts but not `git clean -fdx`. The durable record is
  git history plus the register.
- **`pnpm format:check` fails on 128 files repo-wide** and did so before any of
  this work (measured with `git stash`). Not your regression; do not "fix" it as
  a side quest inside a security tranche.

## 5. The method that has worked

Six tranches, and the same shape each time:

1. **Re-derive the finding before funding work on it.** Neither C-04 nor A-07
   had an executable probe anywhere in the audit record; both turned out to be
   real, but the probes also corrected the details. Write a throwaway `zz-`
   probe, capture its output into the fix commit's body, delete the probe. Do
   not commit an intentionally-red test.
2. **One task per commit, each with its own review, and a fix loop when the
   review finds something.** Every review gets the diff as a file plus the
   task's brief; reviewers are told not to trust the implementer's report.
   *Tranche 4 ran solo — the user's instruction that session was not to
   dispatch subagents — so its review was a self-review of the diff plus the
   sibling-verb grep (every writer to `capital_account`, `expense`, and
   `patronage_record`, confirming all of them sit in the three fixed
   services). That is weaker than an independent reviewer and should be
   read as such.*
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

STATE: tranches 1-6 are merged to main. Every critical-tier finding from the 2026-07-31
audit is now closed: C-01..C-06, A-07, S-08. Open findings filed along the way: N-26
(test-app.ts mounts 19 fewer route modules than production), N-27 (expense review binds no
version), N-28 (nothing watches the dead-letter queue), N-29 (spaces-consumer outbound
endpoints unguarded). The next free finding number is N-30.

PUSHES: routine (the directive was lifted 2026-08-26 — see handover §1).

NEXT: closeout §3 item 7 — N-1, GET /api/v1/cooperative returning an arbitrary
cooperative. Then N-2 (MCP transport + cross-tenant leak, one commit), N-16/N-17,
apps/api/src/ai/.

METHOD: re-derive each finding with an executable probe against real routes before
designing a fix — the audit is not normative and has been wrong about root causes,
severity, and column types. Verify every regression test detects its target. Delete any
defensive branch the suite does not reach. After wiring a guard, grep for the OPERATION it
guards, not the name of what you changed — tranche 6 found a second copy of a resolver
that way.
```
