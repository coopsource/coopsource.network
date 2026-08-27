# Audit tranche 4 — money integrity (C-06 + N-3 + N-4)

- **Written:** 2026-08-26, before implementation
- **Backlog item:** [closeout §3 item 4](./2026-08-02-audit-tranche-1-closeout-and-handover.md)
- **Branch:** `feature/audit-tranche-4-money-integrity`
- **Baseline:** `da1e8a4`

Every finding below was re-derived with an executable probe against real HTTP
routes before any fix was designed. The probe (`apps/api/tests/zz-money-probe.test.ts`)
is deleted before merge; its output is captured in the fix commits.

---

## 0. What the probe found that the audit did not

**The audit understated C-06's redemption race.** Its stated broken end state
was `balance=0, total_redeemed=100, ledger=-100` — which is the *account row*
looking correct. Measured with 8 concurrent `$100` redemptions against a `$100`
balance, reproduced **19/20**:

```
accepted=3..6 of 8   balance=0   total_redeemed=100   ledger_sum=-200..-500
```

Three to six redemptions are **accepted with HTTP 200** and each writes its own
ledger row, but the lost update leaves the account row reading `balance=0,
total_redeemed=100`. So the co-op disburses `$200–$500` against a `$100`
balance **and the account row hides it**: the ledger and the balance disagree by
up to `$400`. The account row is not merely stale — it is a false record of what
was paid out.

Two concurrent contributions reproduce the mirror image on the first attempt
(no loop needed): two `$100` contributions both return 201 and write two ledger
rows summing to `200`, while `balance` and `initial_contribution` both read
`100`. **`$100` of member equity destroyed.**

## 1. Root causes (confirmed, not inferred)

| # | Root cause | Sites |
|---|---|---|
| C-06 | Read-modify-write across separate statements: the new balance is computed in JavaScript from a stale read and written with a blind `SET balance = <computed>`; the sufficiency guard is evaluated against the same stale read; no transaction, so ledger and balance can diverge | `capital-account-service.ts` `recordContribution` (:64), `redeemAllocation` (:214), `allocatePatronageBulk` (:104) |
| N-3 | The status guard reads the row in one statement and the `UPDATE` carries no predicate on `status`, so a transition validated against `submitted` lands on a row that is now `approved` or `reimbursed` | `expense-service.ts` `updateExpense` (:110), `reviewExpense` (:229); sibling `deleteExpense` (:311) has the same shape |
| N-4 | `UNIQUE (fiscal_period_id, member_did, stakeholder_class)` uses PostgreSQL's default `NULLS DISTINCT` and `stakeholder_class` is `NULL` on the default path, so the constraint never fires; `runCalculation` has no period-level "already calculated" guard | `schema.sql:3172`, `patronage-service.ts` `runCalculation` (:138) |

Measured consequences:

- **N-3:** 8 concurrent `PUT`s racing one approve — reproduced **5/5**. An
  expense submitted at `$10` ends `status=approved, amount=100000`.
- **N-3 (double reimbursement):** a stale review write resurrects `approved` on
  a row that already carries `reimbursed_at`, and a second `reimburse` returns
  `{reimbursed: 1}`.
- **N-4:** three byte-identical `calculate` POSTs → 3 record sets → `{approved:3}`
  → `{allocated:3}` → final capital balance **240** for a `$100` surplus at 80%
  retention (correct: 80). Constraint confirmed live as
  `UNIQUE (fiscal_period_id, member_did, stakeholder_class)` — no `NULLS NOT DISTINCT`.
- **N-4 (secondary):** an **uppercase** fiscal-period uuid is accepted as a
  second, distinct period (`201`/`201`) because `runCalculation` stores the
  caller's raw string rather than the `period.id` it just selected; only 1 of the
  2 stored record sets is visible through `listRecords`. A non-uuid
  `fiscalPeriodId` returns **500**, not 400.

## 2. Fix design

**C-06 — make the arithmetic happen in the database.**
Replace every read-compute-write with a single conditional `UPDATE` that does
the arithmetic in SQL, and wrap each ledger row with its balance change in one
`db.transaction()` (an established pattern here — 24 existing sites).

- `recordContribution`: `SET balance = balance + :amount, initial_contribution = initial_contribution + :amount`.
- `redeemAllocation`: the sufficiency guard becomes the `UPDATE`'s own
  predicate — `WHERE id = :id AND balance >= :amount`. Zero rows updated means
  insufficient funds; the transaction rolls back so no ledger row survives a
  rejected redemption.
- `allocatePatronageBulk`: mark the patronage record `distributed` **first**
  with a compare-and-set on `status = 'approved'`, and credit the account only
  when that claims the row. The patronage record becomes the idempotency token.
- Add `CHECK (balance >= 0)` to `capital_account` as a backstop, so a future
  path that forgets is refused by PostgreSQL rather than silently overdrawing.

**N-3 — put the status in the `WHERE`.**
Add the status predicate to each `UPDATE`/`DELETE` and treat zero affected rows
as a conflict (409), not a success. Covers `updateExpense`, `reviewExpense`, and
the sibling `deleteExpense` — per the "guarded one path, missed its sibling"
trap in agent-learnings §1. `reimburseExpenses` additionally requires
`reimbursed_at IS NULL`, so no future resurrection of `approved` can pay twice.

**N-4 — idempotency at three layers.**
1. A period-level guard in `runCalculation`: existing records for
   `(cooperative_did, fiscal_period_id)` → 409.
2. `NULLS NOT DISTINCT` on the unique constraint, as the database-level backstop.
3. Store the normalized `period.id`, not the caller's string, and validate
   `fiscalPeriodId` as a uuid so a bad id is a 400 rather than a 500.

## 3. Commit plan

1. Mount the missing route modules in the test app (see §4) — infrastructure.
2. C-06: capital-account atomicity + `CHECK (balance >= 0)` + regression tests.
3. N-3: expense status compare-and-set on all three verbs + regression tests.
4. N-4: patronage idempotency, normalization, and validation + regression tests.
5. Docs: register amendment, agent-learnings entries, handover refresh.

## 4. New finding — the test app mounts 19 fewer route modules than production

`apps/api/tests/helpers/test-app.ts` builds its own container (a known trap,
agent-learnings §2) and **also** mounts its own route list. Nineteen factories
present in `apps/api/src/index.ts` are absent from it:

```
createCollaborativeProjectRoutes  createCommerceListingRoutes  createCommerceNeedRoutes
createConnectorRoutes             createDashboardRoutes        createEventRoutes
createExpenseRoutes               createIntercoopAgreementRoutes createMcpRoutes
createMentionRoutes               createPaymentWebhookRoutes    createProcurementRoutes
createReportRoutes                createRevenueRoutes          createScheduleRoutes
createSharedResourceRoutes        createTaskRoutes             createTimeTrackingRoutes
createWebhookRoutes
```

Consequence: those HTTP surfaces have **no route-level test coverage at all**,
and a guard added to any of them is invisible to the suite. This is how N-3
reached the probe stage undetected — `POST /api/v1/finance/expenses` returned
404 inside the test app. Several of these routes carry findings that are still
open (N-2's MCP endpoint, S-04's intercoop-agreement and commerce sites).

Filed as **N-26**. This tranche mounts `createExpenseRoutes` because the N-3
regression tests need it; the remaining 18 are a separate change, since each may
surface pre-existing failures that do not belong in a security tranche.
