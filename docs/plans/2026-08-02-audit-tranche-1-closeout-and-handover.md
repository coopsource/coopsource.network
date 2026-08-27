# Audit Tranche 1 — Closeout and Session Handover

- **Date:** 2026-08-02
- **Branch:** `feature/audit-tranche-1-gate0-p0` (19 commits) — merged to `main`
- **Baseline:** `main` at `9c7a496` before this work
- **Program:** [2026-07-31 complete codebase audit](./2026-07-31-complete-codebase-audit-and-refactor-plan.md)
  + [2026-08-01 assessment](./2026-08-01-audit-assessment-and-refactor-program.md)
- **Verification at close:** `pnpm build` + `pnpm test` green — 1119 API tests,
  115 files, 17/17 turbo tasks. Both Docker images build and were run.
- **Live register — amended, not frozen.** §2 and §3 are the repo's only
  maintained "what is still open" lists, so later tranches amend them here
  rather than adding a parallel document that would leave these silently wrong.
  Amended **2026-08-20** for tranche 2 (merged `44afb1e`) and tranche 3
  (`feature/audit-tranche-3-c04-a07`, code commits `6dfdf22..6bb749b`,
  unmerged and unpushed at the time of writing).

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

### Later tranches (amended into this register)

**Tranche 2 — merged `44afb1e`.** Closes backlog items 1 and 2 below: N-18
(test-inclusive typecheck configs, a `typecheck` turbo task and root script, and
`.github/workflows/ci.yml`), N-19 (the test container completed to the
`Container` contract), N-20 (`apps/api/vitest.config.ts` collects by explicit
`include`), N-22 (Tier 2 containment failures made loud). Lexicon generator
hygiene followed at `c9b08f1`, tranche-2 hazards at `381d739`. No closeout
document of its own — its record is git plus
[agent-learnings.md](../agent-learnings.md).

**Tranche 3 — branch `feature/audit-tranche-3-c04-a07`, code commits
`6dfdf22..6bb749b`.** Closes backlog item 3 below. Not pushed.

| Commit | What |
|---|---|
| `6dfdf22` | Test-fixture repair, landed first and green on unmodified source. Two `/membership/approve` tests approved `memberDid: adminDid`, and `addMember` replaces the target's whole role set (`replaceRoles`, `packages/arbiter-client/src/group-mutation-port.ts:822`) — so they silently demoted the suite's admin session from `['owner','admin']` to `['member']` for the rest of a file that runs with `isolate: false`. Now approves a freshly registered DID, with an explicit assertion pinning the admin's roles. |
| `37a0081` | **C-04.** All five agreement federation endpoints take the acting DID from the verified caller (`federationCallerDid()`), on both the signed-peer and the local-session path, through two new helpers: `requireSelfActingCaller` (Axis 5, `service-auth`) and `requireCoopAuthority` (Axis 2, `spaces`). `/signature` additionally requires a pending `signature_request`. `/membership/approve`'s existing gate moved into the same helper with its response bytes unchanged. A separate cross-cooperative scoping bug was found and fixed here: `sign-cancel` authorized against one cooperative but keyed its `UPDATE` only on `(agreement_uri, signer_did)`, so `agreement.amend` anywhere on the instance cancelled pending requests everywhere. |
| `ab844b7` | **C-04, fix round.** `sign-request` gates on the agreement's **ownership** — `agreement.project_uri === params.cooperativeDid` — on top of `agreement.amend` authority over that cooperative. The signer-membership rule that shipped in `37a0081` was reviewed and **deliberately replaced**: it bound the wrong half, leaving a minting loop open (anyone controlling any cooperative could raise a pending request against a victim cooperative's open agreement, and that row then satisfied `/signature`'s pending gate) while making bilateral inter-coop signing impossible. Ownership is what shipped; the signer is deliberately unconstrained. Do not reintroduce the membership rule. |
| `8e68432` | **A-07.** `verifyRequest` now requires `@method` and `@target-uri` coverage, and whenever a body is present requires the `content-digest` component **and** the header **and** a matching digest (`packages/federation/src/http/signing.ts:163-171`). Three bypasses beyond the audit's text fell to the same code: `sig=()` (the component list matches empty), a `content-digest` header present but not covered, and the `@TARGET-URI` case variant — the required matches are exact, because `buildSignatureBase` matches literally. |
| `6482646` | **N-25** (read the identifier note below). `@target-uri` was reconstructed from `req.protocol` + `req.get('host')`; with `trust proxy` on, both halves are attacker-supplied, so a request signed for instance A replayed against instance B by sending `Host: A` — which made A-07's `@target-uri` requirement a no-op for cross-host replay. It is now built from this instance's configured `PUBLIC_API_URL` origin, resolved once at construction, and `Host`/`X-Forwarded-Proto` are read nowhere on the verification path. `infrastructure/docker-compose.federation.yml` set no `PUBLIC_API_URL` on any of its three API services — a genuine config defect, since all three then bound `http://localhost:3001` while the e2e signs `:3001`/`:3002`/`:3003` — and was corrected here. |
| `6bb749b` | **N-25 follow-up.** `PUBLIC_API_URL` had a `.default()` of `http://localhost:3001`, the same value on every instance, so the config could not distinguish "the operator set localhost" from "the operator set nothing" and two instances that both omitted it bound an identical origin and stayed mutually replayable. The default is gone: absence is rejected when `NODE_ENV === 'production'` **or** `INSTANCE_ROLE !== 'standalone'`, and otherwise resolves to `http://localhost:${PORT}`. The role condition is the one that would actually have failed all three federation services at boot — they run `NODE_ENV=development`. |

Each of the four vulnerability fixes — `37a0081`, `ab844b7`, `8e68432`,
`6482646` — was re-derived by running the exploit against the pre-fix source
*first*, and that pre-fix capture is pasted into the commit body. That, not a
green suite, is the evidence; read the bodies before re-litigating any of it.
`6dfdf22` has no body: the role demotion was confirmed by reading the roles back
after the offending test, and the invariant assertion it adds is the durable
record. `6bb749b` is a configuration follow-up, verified by booting the API
against the unchanged root `.env` rather than by a probe.

**Tranche 4 — branch `feature/audit-tranche-4-money-integrity`, code commits
`3878630..24340ee`.** Closes backlog item 4 below (C-06 + N-3 + N-4), the money
bugs. Plan and probe evidence:
[2026-08-26 tranche-4 plan](./2026-08-26-audit-tranche-4-money-integrity-plan.md).

| Commit | What |
|---|---|
| `3878630` | Mounts `createExpenseRoutes` in `apps/api/tests/helpers/test-app.ts`. `POST /api/v1/finance/expenses` returned **404 inside the test app** — the test app keeps its own route list and 19 factories mounted in `apps/api/src/index.ts` are absent from it. Filed as **N-26** in §3. |
| `415fc94` | **C-06.** Balance arithmetic moved into the database. `recordContribution` and `allocatePatronageBulk` use `balance = balance + :n`; `redeemAllocation`'s sufficiency check becomes the `UPDATE`'s own predicate (`WHERE id = :id AND balance >= :n`); each ledger row and the balance change it explains are written in one `db.transaction()`; `allocatePatronageBulk` claims each patronage record's `approved -> distributed` transition with a compare-and-set before crediting. Adds `CHECK (balance >= 0)`. |
| `d6058a4` | **N-3.** `updateExpense`, `reviewExpense`, and `deleteExpense` each repeat the status their guard validated as a predicate on the write, and zero affected rows is a 409. `reimburseExpenses` additionally requires `reimbursed_at IS NULL`. `reviewExpense`'s `UPDATE` is also scoped to `cooperative_did`, which it was not before. |
| `24340ee` | **N-4.** `runCalculation` refuses a period that already has records (409); the unique constraint becomes `NULLS NOT DISTINCT`; `fiscalPeriodId` is parsed as a uuid and lowercased at the route boundary and `period.id` is what gets stored. Three patronage/capital routes that cast `req.body`/`req.query` now parse it, which is what turns the malformed-id 500 into a 400. |

**The probe corrected the audit on C-06.** The audit's stated broken end state
was `balance=0, total_redeemed=100, ledger=-100` — which is the account row
*looking correct*. Measured with 8 concurrent `$100` redemptions against a
`$100` balance, reproduced **19/20**: three to six redemptions are accepted with
HTTP 200 and each writes its own ledger row, while the lost update leaves the
account row reading `balance=0, total_redeemed=100`. The co-op disburses
`$200-$500` against a `$100` balance **and the account row hides it**. Two
concurrent contributions reproduce the mirror image on the first attempt —
two ledger rows summing to `200` against a `balance` of `100`, so `$100` of
member equity is destroyed.

Gate: build 10/10, api suite 118 files / 1157 tests (from 115 / 1140 — the
three new files add 17). Every fix commit carries its pre-fix capture in the
body; read those before re-litigating any of it.

**Tranche 5 — branch `feature/audit-tranche-5-appview-delivery`, code commits
`7b16d43..3e346fc`.** Closes backlog item 5 (C-05) and the dead-letter half
of O-12. Plan and probe
evidence:
[2026-08-27 tranche-5 plan](./2026-08-27-audit-tranche-5-appview-delivery-plan.md).

| Commit | What |
|---|---|
| `7b16d43` | **C-05.** A failed `pds_record` write is dead-lettered with its payload under a new `storage` phase and post-storage hooks are skipped; the two swallowing `.catch()` calls on `recordDeadLetter` rethrow; the Tap record handler rethrows (extracted as `handleTapRecordEvent` so the path is testable); the local loop rethrows instead of continuing, so the outer loop re-subscribes from the last event actually processed. |
| `f913565` | **O-12.** `retryDeadLetter()` claims the entry and counts the attempt in one conditional `UPDATE`, rebuilds the event from the stored payload, replays it, and resolves on success. `POST /api/v1/admin/hooks/dead-letter/:id/retry`. |
| `3e346fc` | **Correction to `7b16d43`.** `recordDeadLetter` falls back to a payload-free row when the payload itself cannot be stored — see below. |

**Measured before fixing.** A failed `pds_record` write left **zero** record
rows, **zero** dead letters, and still ran the post-storage hook, building a
materialized view from a record that was never stored. A hook failure whose
dead-letter write also failed left **no forensic trace of any kind**. The local
loop, given two events whose storage failed, advanced its cursor to the second
event's seq with zero record rows: both permanently skipped.

**Tap acks because CSN swallowed.** `SimpleIndexer.onEvent` awaits the record
handler and then calls `opts.ack()`; `TapChannel` skips the ack when the handler
throws — *"Don't ack on error - let Tap retry"* (`@atproto/tap@0.2.11`,
`dist/channel.js:139-144`). The upstream library already offered the behaviour
CSN wanted; the `try/catch` in `loop.ts` discarded it, and was dead code besides
since `processFirehoseEvent` could not throw.

**`7b16d43` justified its design with a claim that was wrong, and `3e346fc`
corrects it.** The design turns on attempting the dead-letter write as a
liveness probe: if the database can record the failure, the failure is specific
to this event and the stream may move on; if it cannot, throwing is right. The
motivating example given was a record containing a NUL byte "making a text
insert fail permanently". Measured: `pds_record.content` and
`hook_dead_letter.event_data` are both **jsonb**, not text; PostgreSQL rejects
NUL in jsonb ("unsupported Unicode escape sequence") while accepting the same
JSON as text; and because both columns receive the same record, such a record
broke **both** writes, so the pipeline threw and the firehose stalled on it —
exactly the availability failure the design claimed to avoid. `recordDeadLetter`
now falls back to a payload-free row flagged not-replayable, which both fixes
the stall and sharpens the contract: after it, a failed dead-letter write really
does mean the database is unavailable.

**Checked and cleared:** `packages/spaces-consumer/src/consumer.ts` has the same
shape and does **not** have the defect — `canCommitCheckpoint` tracks whether
every record in a batch was handled and the checkpoint is committed only if all
were. The admin reindex route (`admin.ts:71`) already wrapped the pipeline in a
try/catch and counted errors; that counter was previously always zero and is now
meaningful.

Gate: build 10/10, api suite 120 files / 1173 tests (from 118 / 1157).

**Tranche 6 — branch `feature/audit-tranche-6-ssrf`, code commit `5274481`.**
Closes backlog item 6 (S-08). Plan and probe evidence:
[2026-08-27 tranche-6 plan](./2026-08-27-audit-tranche-6-ssrf-plan.md).

**Reachable unauthenticated, and measured.** A POST to
`/api/v1/federation/agreement/sign-request` whose `keyid` named
`did:web:127.0.0.1%3A<port>` made the API issue `GET /.well-known/did.json`
against that port, recorded by a listener the test started. `verifyRequest`
resolves the signer's DID **before** it can check the signature — the key it
needs is inside the document — and everything it checks first (component list,
algorithm, `created` skew, `content-digest`) is computable by the caller from
their own request. The A-07 work (tranche 3) shaped what a usable request looks
like; it does not gate the fetch, because the digest is a hash of the
attacker's own body, not a secret.

**Three defects.** `didWebToUrl` downgraded to **http** for any dotted quad, so
`did:web:169.254.169.254` fetched cloud metadata in plaintext and `%3A` ports
made a DID an internal port selector. `validateWebhookUrl` allowed `[::1]`,
`[fd00::1]`, `[fe80::1]`, `[::ffff:127.0.0.1]`, `127.0.0.2`, `127.5.5.5`,
`0.0.0.0`, `169.254.1.1` and `100.64.0.1` — because `URL.hostname` keeps the
brackets on an IPv6 literal (so `hostname === '::1'` is dead code) and because
single addresses were listed where ranges were meant. And no path had a DNS
check, redirect control, timeout, or size cap.

**Also worth knowing:** against the pre-fix code the metadata-address case took
**10.4 s**, hanging on the connect. The endpoint was a free request-stall
amplifier as well as a read oracle.

**Sibling swept.** `apps/api/src/appview/commit-verifier.ts` holds a **second**
did:web resolver, independent of `DidWebResolver`, reached with a record
author's DID. It is now behind the same guard. Every other `fetch()` in the tree
was checked and takes an operator-configured or constant URL.

The guard is `packages/federation/src/http/url-safety.ts` — deliberately not
`@coopsource/common`, which `apps/web` imports and which is Node-free.
`DID_RESOLUTION_ALLOW_PRIVATE` opts private targets back in for local
development and the Docker federation stack; it defaults on outside production
and config validation **rejects it in production**.

Gate: build 10/10, api 121 files / 1178 tests, federation 198 tests.

**On the identifier `N-25`.** The cross-host replay finding is **N-25** — the
next free number after the [2026-08-02 independent deep
review](./2026-08-02-independent-deep-review.md), whose series runs
**N-1..N-24**. An earlier draft of this tranche numbered it N-23 without
checking, colliding with that review's **N-23** ("API token `scopes` are stored,
returned, and resolved but never enforced" — a different finding, still open and
listed in §3). The label was corrected across the code, the tests, this
register, and the commit subjects before merge, so `N-23` now means only the
API-token-scopes finding.

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

### From tranche 3 — do not read "C-04 fixed" as more than it is

C-04 bound *identity*. It did not make a signature row into evidence of
anything, and it did not close replay. Everything below was deliberately left
open; all line cites are against `6bb749b`.

- **Signature evidence is still never resolved from the signer's PDS, and
  `agreement_cid` is still `''`.** `/api/v1/federation/agreement/signature`
  (`apps/api/src/routes/federation.ts:533`) stores the `signatureUri` and
  `signatureCid` the request body supplies, unverified, and writes
  `agreement_cid: ''` at `:613` — so a stored signature binds no version of the
  agreement it signs. After C-04 a signer can only lie about *their own*
  evidence, which is a real reduction, not a fix. (L-06 / audit Phase-1 item 5.)
- **DID equality is rotation-unaware.** The new gates compare with `===`
  (`federation.ts:52`), matching the reference gate. This is a *knowing*
  deviation from CLAUDE.md's "consult `did_rotation_history` on every
  DID-equality check": the table has a reader
  (`packages/spaces-consumer/src/did-equivalence-port.ts:51`) but no production
  writer (M-14), so consulting it adds no information today. Consequence to
  remember: after a rotation, a signer is locked out of retracting their own
  signature.
- **`content-digest` binds re-serialized JSON, not the wire octets.**
  `apps/api/src/middleware/federation-auth.ts:105` hands the verifier
  `JSON.stringify(req.body)`. Not forgeable — `JSON.stringify` is injective over
  parsed values, and the parsed value is what handlers consume — but it breaks
  interop with signers whose serializer differs (unicode escapes, big integers),
  and both edges of it are unbound: a content-type `express.json()` does not
  recognise leaves `req.body` absent, yielding `null`, so `verifyRequest`'s
  `if (body)` skips the digest requirement and real wire bytes ride unsigned
  (harmless *only* because every handler reads `req.body` and Zod-400s, and live
  the moment any route reads the raw stream); conversely a zero-length body with
  `content-type: application/json` yields `'{}'`, for which no signer emits a
  digest — that edge fails closed. The obvious one-line fix for the first was
  designed and rejected because it would have stopped the second failing closed.
  The real fix is raw-body capture in an `express.json()` `verify` callback,
  deferred to the service-auth XRPC work.
- **There is no replay or nonce cache.** `packages/federation/src/http/signing.ts:24`
  allows ±300 s and the check is two-sided (`:154`), so a captured request
  replays for roughly ten minutes. The origin binding narrowed replay to the
  instance the request was signed *for*; it did nothing about replay against
  that instance.
- **`sign-cancel` authorizes against the body's `cooperativeDid`,** not the
  stored `signature_request.cooperative_did` (`federation.ts:673`). The `UPDATE`
  is now scoped to the same `cooperative_did`, so the authority checked and the
  row mutated cannot diverge — but row-bound authorization is the correct shape
  once an outbound client exists.
- **Cross-instance role authority is empty for any cooperative never set up
  locally.** `resolveRolePermissions`
  (`apps/api/src/services/role-permissions.ts:13`) reads only per-coop
  `role_definition` rows and has no built-in role fallback, so for a foreign
  cooperative the permission set is empty and `requireCoopAuthority` degenerates
  to the `caller === cooperativeDid` short-circuit. Fail-closed, but do not read
  "coop authority" as something that works across instances.
- **Person signers need cross-instance DID resolution.** Signing as an
  individual requires the receiving instance to resolve the person's DID
  document — `did:web`, or `PLC_URL` pointing at a shared directory. With
  `PLC_URL='local'` it 401s in the middleware, before any gate. Do not relax
  `===` to work around this.
- **Inbound federated `sign-request` now requires the agreement to be indexed
  locally** with a matching `project_uri`. A peer soliciting on an agreement
  this instance has not indexed gets 403 *"Agreement does not belong to the
  cooperative making the request"*, which misdescribes the cause. Fail-closed,
  zero production callers today, but a real narrowing of the cross-instance
  path.
- **An instance left at `INSTANCE_ROLE: standalone` still serves every
  federation endpoint.** `apps/api/src/index.ts:285` mounts the federation
  routes unconditionally, so the origin requirement added in `6bb749b` is gated
  on a *self-declared role*, not on whether the signed endpoints are live: such
  an instance runs on the resolved fallback origin
  (`http://localhost:${PORT}`) while still exposing every
  `requireFederationAuth` route. This is strictly narrower than the pre-tranche
  state and sits inside the fallback the fix deliberately permits, but it is
  where the remaining exposure lives. The natural later tightening is to gate on
  "federation enabled" rather than on the role string.
- **`well-known.ts` publishes `INSTANCE_URL` as the DID document
  `serviceEndpoint`** (`apps/api/src/routes/well-known.ts:88,93`; `:38` also
  derives the `did:web` from it), which after `6482646` is a *different* value
  from the origin inbound requests are verified against. They are identical in
  the prod and local compose stacks and diverge only in
  `docker-compose.federation.yml`, where `INSTANCE_URL` is deliberately
  compose-internal (`http://coop-b:3003`) and nothing dials it. Latent today —
  there is no production `signRequest` caller — but it must be reconciled before
  any outbound federation client lands, or it presents as an inexplicable 401.
- **The RFC 9421 parser is containment only.** It is scheduled for replacement
  by service-authenticated XRPC. Do not invest further in it.

### From tranche 4 — what the money fixes do not cover

- **A review binds no version of the expense (N-27).** The status
  compare-and-set stops an edit landing *after* an approval. It does nothing
  about one that lands *before* it: a reviewer who opens a `$10` expense and
  clicks approve binds whatever the amount is at the moment their write
  executes. Closing it needs an optimistic-concurrency token on the review
  request, which changes the route contract, so it is filed rather than fixed.
  A test asserting the stored row matches what the approval returned was
  written and removed — measured **0/3** detection against the pre-fix
  service, because every racing edit reliably landed before the approval.
- **`deleteExpense`'s guard is still unreachable.** `createExpense` hardcodes
  `'submitted'` and nothing writes `'draft'`, so the endpoint 400s for every
  reachable state. Its compare-and-set was added anyway — same read-then-write
  shape as its two siblings — and its test seeds the `draft` row directly.
- **`patronage_record.fiscal_period_id` is still `text` against a `uuid` PK.**
  Normalization now happens at the route boundary, so every stored value is
  canonical and every lookup is lowercased. The column type is unchanged, per
  the deep review's instruction not to act on the type framing.
- **Only `createExpenseRoutes` was mounted in the test app.** The other 18
  missing factories are N-26 in §3; each may surface pre-existing failures
  that do not belong in a security tranche.
- **Concurrency coverage is invariant-based, not exhaustive.** The pins assert
  properties that hold for any interleaving (ledger sum equals balance;
  exactly one redemption of the whole balance is accepted) and the stale-read
  cases are made deterministic with a Kysely `transformResult` gate. Nothing
  here proves the absence of a race in a path the tests do not drive.

### From tranche 5 — what the delivery fixes do not cover

- **A record that cannot be stored is still lost, by design.** The fix
  guarantees the loss is *recorded*, not that it is prevented. A dead letter
  written without its payload is flagged not-replayable: the URI identifies the
  record and it can be refetched from the PDS, but nothing does that
  automatically.
- **Retrying a hook-phase dead letter reports only that the pipeline
  completed.** The pipeline is fail-open for hooks, so a hook that fails again
  lands a fresh dead-letter entry rather than reopening the old one. The queue,
  not the retry response, is the current state of a hook failure. Only the
  `storage` phase is verified concretely (against `pds_record`).
- **Replay re-runs every hook for the collection, not just the one that
  failed.** Correct for a storage-phase entry and idempotent in principle for
  the rest — the firehose can redeliver anyway — but it assumes hooks are
  idempotent, which nothing enforces.
- **The Tap path has no end-to-end test.** `handleTapRecordEvent` is tested
  directly, and the ack semantics it relies on were read out of
  `@atproto/tap@0.2.11`'s source and are recorded above, but no test drives a
  real Tap channel. A change in that upstream contract would not be caught here.
- **Nothing alerts on a growing dead-letter queue.** `getFirehoseHealth()`
  exposes `errorCount` and `lastSeq`, and the queue is listable, but there is no
  threshold, no alert, and no automatic replay.

### From tranche 6 — what the SSRF containment does not cover

- **DNS rebinding is not closed.** The answer is checked and then a separate
  connection is made, so a name that answers differently the second time still
  wins the race. Closing it needs the socket pinned to the checked address — a
  custom dispatcher rather than `fetch`. What is closed is the straightforward
  case: a public hostname whose record points at an internal address.
- **`DID_RESOLUTION_ALLOW_PRIVATE` disables the address check entirely**, not
  just for the peers you meant. It is on by default outside production. A
  development instance therefore remains steerable; that is the price of
  `did:web:localhost%3A3001` resolving at all.
- **The spaces-consumer endpoints are untouched** — filed as item 23. They were
  in S-08's evidence list and are not fixed.
- **Only the destination is guarded, not the response.** A permitted host can
  still return anything; nothing validates that a DID document is well-formed
  beyond the `verificationMethod` lookup that follows.

---

## 3. What is left, in recommended order

Ordering is from the 2026-08-02 multi-agent review, adjusted for what shipped.
Numbering is stable so older references stay valid: closed items keep their
number and carry a **[DONE]** marker naming the tranche and commit. **Items 1-3
are closed; start at item 4.**

### Immediate — trustworthy signal and enforcement

1. **[DONE — tranche 2, `44afb1e`] N-18 / no CI.** `apps/api/tsconfig.json` was
   `"include": ["src"]`, so tests were never typechecked (41 hidden errors),
   there was no `typecheck` turbo task, no root script, and no `.github/`
   directory. All four now exist (`turbo.json`, root `typecheck` script,
   `.github/workflows/ci.yml`).
2. **[DONE — tranche 2, `2f16355`] N-20** — `apps/api/vitest.config.ts` now
   collects by explicit `include` rather than the default glob.

### The still-open criticals

3. **[DONE — tranche 3, `6dfdf22..6bb749b`] C-04**, folded in with A-07 and the
   cross-host replay finding. Precisely what "done" covers:
   - caller-identity binding on all five agreement federation endpoints —
     `sign-request`, `signature`, `sign-reject`, `sign-cancel`,
     `signature-retract` (`apps/api/src/routes/federation.ts:420,533,641,673,727`)
     — on **both** the local-session and the signed-peer path, since both
     resolve through `federationCallerDid()`;
   - `/signature` additionally requires a pending `signature_request`, so
     identity alone no longer lets a session holder attach a binding signature
     to an open agreement nobody asked them to sign;
   - `/sign-request` requires the **agreement to be owned by** the cooperative
     named in the request (`agreement.project_uri`), on top of `agreement.amend`
     authority over that cooperative. An earlier signer-membership rule was
     implemented, reviewed, and deliberately replaced — see §1. Do not
     reintroduce it;
   - A-07's request-coverage containment
     (`packages/federation/src/http/signing.ts:163-171`);
   - the origin binding in `apps/api/src/middleware/federation-auth.ts`.

   It does **not** cover signature evidence, agreement-version binding, DID
   rotation, replay inside the skew window, raw-octet digests, or federation
   routes on a `standalone` instance. Read §2 before treating a signature row as
   proof of anything.
4. **[DONE — tranche 4, `3878630..24340ee`] C-06 + N-3 + N-4**, the money bugs.
   Precisely what "done" covers: capital-account balance arithmetic happens in
   the database inside a transaction, with the redemption sufficiency check as
   the `UPDATE`'s own predicate and `CHECK (balance >= 0)` behind it; all three
   expense state transitions repeat their validated status as a write predicate
   and answer a lost race with 409, and `reimburseExpenses` also requires
   `reimbursed_at IS NULL`; a patronage period is calculated once, enforced by a
   period-level guard with `NULLS NOT DISTINCT` behind it, with `fiscalPeriodId`
   parsed as a uuid and normalized at the route boundary. It does **not** cover
   version binding on review (N-27) — read §2 before treating an approval as
   proof of the amount the reviewer saw.
5. **[DONE — tranche 5, `7b16d43..3e346fc`] C-05**, bundled with the
   dead-letter half of **O-12** as the review recommended. Precisely what "done" covers: a failed `pds_record`
   write is dead-lettered rather than logged and forgotten, post-storage hooks
   no longer run after one, dead-letter write failures propagate instead of
   being swallowed, the Tap handler rethrows so Tap redelivers, the local loop
   does not advance its cursor past an event it could not process, and dead
   letters can be replayed through a new admin retry route. It does **not**
   recover a lost record automatically, and it does not verify a hook-phase
   replay — read §2 before treating a resolved dead letter as proof.

   **O-12's other half is untouched.** The finding covers two inert
   mechanisms, and only the dead-letter queue was addressed. The outbound
   webhook outbox (`apps/api/src/services/event-bus-service.ts:146-185`) still
   creates delivery logs, still has no producer call sites, and still has no
   delivery worker. Carried forward as item 21.
6. **[DONE — tranche 6, `5274481`] S-08.** Precisely what "done" covers: the
   did:web http downgrade is narrowed to loopback; a real IPv4/IPv6 address
   classifier replaces the exact-string comparisons; DID resolution, webhook
   delivery and script HTTP calls all go through one guarded fetch that checks
   the destination, checks every DNS answer, refuses redirects, and bounds time
   and size; and the second did:web resolver in `commit-verifier.ts` is behind
   the same guard. It does **not** close DNS rebinding and does **not** touch
   the spaces-consumer endpoints (item 23) — read §2 before treating an
   outbound call as contained.

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

### Dependency hygiene (new surface, 2026-08-26)

Publishing the repo made GitHub's Dependabot alerts visible: **75 open
(24 high / 43 medium / 8 low)**.

- **[DONE — `feec5d8`, 2026-08-26] All 24 high-severity advisories patched.**
  Direct bumps (kysely → 0.28.17, nodemailer → 9, ws → 8.21, multer → 2.2)
  plus raised security floors in `pnpm-workspace.yaml` `overrides` — which is
  where **pnpm 11 reads overrides** (a `pnpm.overrides` block in
  `package.json` is silently ignored with a warning). Total fell 75 → 15;
  32 medium and 4 low closed incidentally. Gate: build 10/10, typecheck
  16/16, test 17/17 (api 115 files / 1140 tests, unchanged).
  - *Trap for the next reader:* bare `>=` floors are unbounded and pulled
    **undici 8** and **fast-uri 4** on the first pass. Both are now carets so
    the floor cannot cross a major. Prefer `^` when adding a floor.
  - *Not exploitable here:* the kysely advisory (GHSA-pv5w-4p9q-p3v2)
    targets `JSONPathBuilder.key()/.at()`, which CSN never calls (verified);
    the `->>` occurrences are raw SQL template literals. Patched anyway.
- **17. Remaining 15 alerts (11 medium / 4 low), all with patches
  available:** `svelte` (4), `@sveltejs/kit` (4), `esbuild` (2), `turbo` (2,
  dev), `qs`, `@hono/node-server`, `body-parser`. Deliberately not bundled
  into the high-severity commit: the Svelte/SvelteKit bumps touch 86 web
  pages and the 84-spec Playwright suite, so they want their own change with
  a UI regression run. Everything else there is a one-line floor.

### Diagnosability (new surface, 2026-08-26)

18. **A failed `POST /api/v1/setup/initialize` is undiagnosable from the
    client.** Found live: completing the co-op setup wizard against a
    schema-stale database returned a bare `Internal Server Error` with no
    detail, no error code, and **no correlation ID**, while the actual cause
    (`column "directory_visible" of relation "membership" does not exist`,
    PG 42703, from `group-mutation-port.ts:270` via `setup.ts:149`) was
    recorded on a *separate* server log line. Two distinct problems:
    - **No correlation ID.** The 500 body carries nothing that ties it to
      the `"Unhandled error"` log entry. pino-http already assigns `req.id`
      (the failing request was id 222) — returning it in the error body and
      an `x-request-id` header would turn "check the whole log" into one
      grep. This generalizes past setup: it is the shape of every 500 the
      API returns.
    - **The error-level log line does not name the request.** The
      `"Unhandled error"` entry has `method` and `path` but no `req.id`,
      so it cannot be joined to the request-completed line except by
      timestamp. Searching the logs at error level alone returns the
      pino-http wrapper (`"failed with status code 500"`) and *not* the
      DatabaseError — which is exactly why the first log query for errors
      came back empty-handed.
    - Scope note: intentionally **not** about leaking detail to clients. The
      generic body is correct for a public API; the ask is a correlation
      handle plus a joinable server-side log line. Setup is also
      pre-auth/pre-tenant, so it has no user-facing error surface at all.
    - Related environment finding (not a code defect, no backlog item): a
      long-lived local `coopsource_dev` can drift far behind
      `schema.sql` — the instance that produced this error was missing 74
      columns and 7 tables (all Phase 3/4 work). `make db-reset` is the
      sanctioned fix; the failure mode it produces is an opaque 500, which
      is the argument for the correlation ID above.

### New surface from tranche 3

14. **Signature-request inbox spam.** Now that `sign-request` gates on agreement
    ownership rather than signer membership, a caller with `agreement.amend` in
    a cooperative can raise pending signature requests naming **any DID that has
    a live `entity` row on this instance** (`federation.ts:475-486`), not only
    that cooperative's members. Bounded by ownership — they must be soliciting
    on their own cooperative's agreement — and by the 255-char title cap; the
    surface it lands on is `GET /api/v1/me/signature-requests`. This is the
    agreed lower-severity consequence of the ownership decision, filed rather
    than fixed.
15. ~~**The `N-23` label is ambiguous.**~~ **Resolved before merge** — the
    federation replay finding was renumbered to **N-25** at every code, test,
    doc, and commit-subject site; the deep review's `N-23` (API token scopes)
    is untouched and remains open. See the identifier note in §1.

16. **A-07 regression coverage is partial.** There is no committed test for the
    subtlest bypass and the one that was actually live: a `content-digest`
    header *present but not covered* by the signature. The four committed cases
    in `packages/federation/tests/http-signing.test.ts` catch a full revert but
    not a partial regression that keeps the header-presence check and drops the
    coverage check — exactly the shape that reopens the hole. A fifth case (sign
    a real body via `signRequest`, then re-sign over a component list omitting
    `content-digest` while leaving the valid header in place) closes it.
    `@TARGET-URI` likewise has no committed test, though it shares its mechanism
    with the tested `@method`.

### New surface from tranche 4 (2026-08-26)

19. **N-26 — the test app mounts 19 fewer route modules than production.**
    `apps/api/tests/helpers/test-app.ts` keeps its own route list, and these
    factories present in `apps/api/src/index.ts` are absent from it:
    `createCollaborativeProjectRoutes`, `createCommerceListingRoutes`,
    `createCommerceNeedRoutes`, `createConnectorRoutes`,
    `createDashboardRoutes`, `createEventRoutes`,
    `createIntercoopAgreementRoutes`, `createMcpRoutes`,
    `createMentionRoutes`, `createPaymentWebhookRoutes`,
    `createProcurementRoutes`, `createReportRoutes`, `createRevenueRoutes`,
    `createScheduleRoutes`, `createSharedResourceRoutes`, `createTaskRoutes`,
    `createTimeTrackingRoutes`, `createWebhookRoutes`. (`createExpenseRoutes`
    was the nineteenth and is mounted as of `3878630`.)

    Those HTTP surfaces have **no route-level test coverage at all**, so a
    guard added to any of them is invisible to the suite. This is how N-3
    survived: `POST /api/v1/finance/expenses` returned 404 inside the test
    app. Several carry findings that are still open — N-2's MCP endpoint,
    S-04's intercoop-agreement and commerce sites. This is the same class as
    the N-19 container gap, one layer up: closing N-19 typed the container, not
    the router. Expect pre-existing failures when mounting them; do it as its
    own change, not inside a security tranche.

20. **N-27 — expense review binds no version of the expense.** See §2. A
    reviewer approves whatever the row says at the moment their write executes,
    not what they read. Needs an optimistic-concurrency token on the review
    request (`indexed_at`, or a version column), which changes the route
    contract and the web client.

### Carried forward from tranche 5

21. **O-12, outbound webhook half.** Delivery logs are created by code nothing
    calls, and no worker delivers them. Untouched by tranche 5, which addressed
    only the dead-letter queue. Evidence unchanged from the audit:
    `apps/api/src/services/event-bus-service.ts:146-185`.

22. **N-28 — nothing watches the dead-letter queue.** Now that failures are
    actually recorded rather than swallowed, the queue is the signal that
    something is being lost, and nothing reads it: no threshold, no alert, no
    automatic replay. `getFirehoseHealth()` exposes `errorCount` and `lastSeq`
    but not the queue depth. Cheap first step: add unresolved dead-letter count
    to the health endpoint. **The next free number is N-29.**

23. **N-29 — the spaces-consumer's outbound endpoints are unguarded.** Named in
    S-08's evidence and deliberately left by tranche 6.
    `packages/spaces-consumer/src/did-permissioned-sync-resolver.ts` validates
    that a service endpoint is http(s) and nothing more — no address check, no
    redirect control, no timeout — and the endpoint comes from a resolved DID
    document, so its author chooses it.
    `xrpc-permissioned-repo-port.ts` fetches through an injected `fetcher`, so
    the guard belongs either at that seam or in `parseHttpUrl`. Not live today:
    the consumer is flag-gated behind `SPACES_CONSUMER_ENABLED`, false outside
    conformance environments. Left out of tranche 6 because wiring it means
    reasoning about the permissioned-sync design rather than adding a check.
    **The next free number is N-30.**

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
- ~~Do not push audit-remediation branches to `origin` without asking.~~
  **Lifted 2026-08-26 (Alan):** pushes are routine again — Alan synced origin
  himself and clarified the directive originated in a period of repeatedly
  failing pushes on his end, compounded by the disclosure concern. The
  criticals' write-ups are now published while C-06/N-3/N-4, C-05, S-08
  remain open — urgency up. CI's first-ever run (Alan's 2026-08-21 push)
  **passed** (8m3s) — the first-run warning resolved without drama.
- ~~Do not delete branches.~~ **Lifted 2026-08-26 (Alan):** merged-branch
  cleanup executed — all 34 local and 21 origin feature branches (every tip
  verified contained in `main`) deleted; only `main` remains on both.
  CLAUDE.md's "clean up merged branches" rule governs again.
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

STATE: tranche 1 (Gate 0 + P0) and tranche 2 (typecheck + CI) are merged to
main; tranche 3 (C-04 / A-07 / federation origin binding) is on
feature/audit-tranche-3-c04-a07 and is NOT pushed. Build and both Docker images
are green; the test harness is isolated per run. Section 2 of the handover
lists what is only partially fixed — read it before trusting any "fixed" label,
especially C-03 and C-04.

DO NOT trust a green suite as proof. The suite was green through eleven real
defects in this program. Execute the thing you are verifying; when chasing an
intermittent, loop until failure rather than sampling three clean runs.

START WITH: the first open item in the handover's ordered backlog — items 1-3
are closed, so that is item 4 (C-06 + N-3 + N-4, the money-integrity findings) —
unless the user directs otherwise. Confirm the plan before implementing.
```
