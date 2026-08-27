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
