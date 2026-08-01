# Audit Assessment and Amended Refactor Program

- **Date:** 2026-08-01
- **Status:** Assessment complete; program adopted pending approval gates
- **Code baseline:** `main` at `9c7a496`
- **Ecosystem cutoff:** 2026-08-01 (live primary-source refresh, this session)
- **Underlying audit:** [2026-07-31-complete-codebase-audit-and-refactor-plan.md](./2026-07-31-complete-codebase-audit-and-refactor-plan.md) — adopted by reference as the canonical audit and remediation program (Gate 0 + Phases 1–8). This document does not restate it; it layers verification results, ecosystem deltas, an amendment register, and a decision register on top.
- **Implementation:** None authorized by this document (user decision: plan only).

## 1. Assessment Verdict

**The 2026-07-31 report is accurate and is adopted as the canonical audit. Its conclusion — "not safe to deploy or operate as documented" — stands.**

Verification method: three independent read-only verification passes over a `git archive` snapshot of `main@9c7a496`, plus two direct spot-checks, sampling 22 findings across all severity classes: all six criticals (C-01..C-06), six ATProto-conformance findings (A-01, A-02, A-04, A-06, A-12, A-14), and ten security/logic/ops/web findings (S-01, S-02, S-03, S-06, L-01, L-03, O-01, O-04, O-06, W-01). **Result: 22 of 22 CONFIRMED. Zero refuted. No overlooked mitigations found.** Each verification read the cited files plus caller/middleware context specifically hunting for guards the report might have missed; none existed.

### Per-finding verification table

| ID | Verdict | Decisive evidence |
|---|---|---|
| C-01 | CONFIRMED | `hooks/builtin/index.ts:35,44` invokes projectors with no constraints; `proposal-indexer.ts:26,73` takes coop DID from the record itself; `membership-read-model.ts:899` `return result?.vote_weight ?? 1` (non-member ⇒ weight 1); `lexicon-validator-hook.ts:31-42` fail-open ("storing anyway"); no `closes_at` gate in `indexVote`. Permissioned path *is* guarded (`permissioned-governance-projector.ts:89-94`) — the asymmetry is the finding. |
| C-02 | CONFIRMED | `admin-scripts.ts:19-29` sole gate is session-coop match (an `hasRole('admin','owner')` middleware exists at `auth/middleware.ts:179` but is unused here); `worker.ts:151-153` `vm.createContext({ ctx, Promise, ... })` — outer-realm `Promise` ⇒ `Promise.constructor('return process')()`; callbacks include `pds.createRecord` with `operatorDid: cooperativeDid`; prod packaging defect (`worker.ts` + pruned `tsx`) blocks launch but is not a security boundary. |
| C-03 | CONFIRMED | `governance-record-placement-port.ts:48-58` keys on `governance_visibility` only, `open`/`mixed`/missing-profile all fall through to `{kind:'public-repo'}`; `proposal-service.ts:280-318` writes full draft content to the public repo while DB row is `status:'draft'`; placement port has **only 2 call sites** — stakeholderTerms (`agreement-service.ts:704-706`) and pledges (`funding-service.ts:307-317`) write publicly despite permissioned declarations in `space-types.ts:73-76`. |
| C-04 | CONFIRMED | `federation-auth.ts:19-21` local-session short-circuit; the correct primitive `federationCallerDid()` (`federation.ts:22-32`, commented "Never a request-body field — those are attacker-controlled") is called **exactly once** (`:264`); all five agreement endpoints (`:340,403,483,510,537`) trust body `signerDid`/`cooperativeDid` verbatim; `agreement_cid: ''` hardcoded; signature URI/CID never resolved against signer's repo. |
| C-05 | CONFIRMED | `loop.ts:120-137` record callback catches without rethrow (identity handler at `:147-154` rethrows — the in-file contract); `pipeline.ts:135-139` swallows `pds_record` write failure and runs projectors anyway ("fail-open" stated in `dead-letter.ts:10`); local mode catch (`loop.ts:207-223`) rethrows only lifecycle events, so the next success advances the cursor past a failed record. (Tap-acks consequence inferred from the rethrow contract; Tap package not vendored.) |
| C-06 | CONFIRMED | Zero `transaction()` calls in `capital-account-service.ts` / `patronage-service.ts`; balance updates from stale reads without lock/CAS; overdraft check against stale snapshot; `allocatePatronageBulk` 3 unguarded statements/member, status update without `where status='approved'`; `schema.sql:3168-3172` UNIQUE includes nullable `stakeholder_class` (Postgres NULLS DISTINCT) and NULL is the default path — double calculation inserts silently. |
| A-01 | CONFIRMED | `"type":"number"` in proposal/vote/expense/revenue JSON + `"format":"cid-link"` in expense — both invalid per pinned `@atproto/lexicon@0.6.1`; inventories diverge: 52 JSON files vs 44 runtime docs vs 23 `LEXICON_IDS`; **the 5 excluded docs are exactly those that would crash `new Lexicons()`**; `tests/lexicons.test.ts` encodes the drift as expected; `lex:generate` writes only `lexicons.ts` — `types.ts` is hand-maintained and drifted. |
| A-02 | CONFIRMED | Vote writer emits `proposal`/`proposalCid`, missing required `proposalUri` and `voterDid`; proposal writer missing `cooperativeDid`, `proposalType`, `votingMethod`, `status` (uses `cooperative`/`votingType`); `projectUri: cooperativeDid` — a DID in an `at-uri` field; signature record missing 3 of 4 required fields; stakeholderTerms uses `agreementUri` where lexicon requires `masterAgreementUri`. **No write path calls `validateRecord`** (single caller: consent-evidence-verifier). |
| A-04 | CONFIRMED | `well-known.ts:74-95` publishes `#signingKey` (JsonWebKey) + `#coopsource`/`#inlay` services — not `#atproto`/`#atproto_pds` (the correct constants exist unused at `permissioned-data-draft.ts:277-282`); root well-known can serve a `did:plc` or path-based `did:web` document; `commit-verifier.ts:97-98` takes `verificationMethod[0]` and mishandles path-based did:web; the verifier has no production callers. |
| A-06 | CONFIRMED | `oauth-client.ts:37-45` requests exactly `'atproto'` + seven `rpc:network.coopsource.*` namespace scopes; no `repo:` scope, no `transition:generic` anywhere in the repo; `MemberWriteProxy` `com.atproto.repo.createRecord/putRecord` calls have no authorizing scope. |
| A-12 | CONFIRMED | Default `PERMISSIONED_RECORD_WRITER_MODE='private-record'`; physical key drops `spaceKey`+`spaceType` from `SpaceRef` (collision across spaces under one arbiter); `cid:'private'` persisted into `proposal.cid`/`vote.cid`; rkeys are 15-hex (not TID) and physical keys contain `/`. **Wired unconditionally in `container.ts` — not gated by `SPACES_CONSUMER_ENABLED`** (that flag gates only the read/consume loop). |
| A-14 | CONFIRMED | Cursor = max `rev` per page with strict-advance check; no per-op sub-cursor; `listRepoOps` request sends no `cursor` param — a revision split across pages ⇒ silent gap or hard verification error; recovery routes to `getRepo`, which the pinned target records as `MethodNotImplemented` (`permissioned-conformance.ts:150-157`, impact "blocking"). Pin `3f6c96d5` recorded in ~20 locations; source of truth `packages/lexicons/src/permissioned-data-draft.ts:14-17`. |
| S-01 | CONFIRMED | `coordinator` holds `member.roles.assign`; `UpdateRolesSchema` = arbitrary strings, max 10; no ceiling/self-target check anywhere down the chain (`membership-service.ts:193-212` → `group-mutation-port.ts:624-681` = trim/dedupe only); invitation path identical. Exploit: coordinator `PUT /api/v1/members/<own-did>/roles {"roles":["owner"]}` → wildcard. |
| S-02 | CONFIRMED | `membership_policy` written at setup but **never read in the registration path**; `POST /api/v1/auth/register` gated only by `requireSetup`; no-invitation branch persists `status:'active'`, role `member`, and sets a live session cookie. |
| S-03 | CONFIRMED | `createPinoHttp({ logger })` — no serializers/redact; mounted globally before session middleware; Cookie, Authorization (MCP tokens, service-auth JWTs, Inlay JWTs), and federation `Signature` headers all traverse it at default `info`. Scope correction: the payment-webhook router mounts *before* the logger, so Stripe signatures escape. |
| S-06 | CONFIRMED (spot-check) | Webhook verifies with per-coop provider config from URL params, then `findPledgeByPaymentSession(sessionId)` is a **global** lookup unscoped to the authenticated cooperative; a coop admin controlling their own webhook secret can forge completion of another coop's known session. |
| L-01 | CONFIRMED | Delegate weight = own base + Σ delegator bases with no check whether a delegator voted directly; revocation only sets `status:'revoked'` — cast weights never recomputed; departed delegators fall back to weight **1** (`?? 1`), not 0. Bonus defect: the delegation adapter drops the `at`/`proposalUri` as-of arguments. |
| L-03 | CONFIRMED | `superMajority` maps only to a turnout threshold (2/3 of eligible as `votes.length`); binary passage stays `yes > no`; `quorum_basis` stored, indexed, echoed — never applied (`votesCast` ≡ `totalMembers`); any non-empty `choice` string and zero-weight ballots count toward quorum without entering the tally. |
| O-01 | CONFIRMED | API Dockerfile copies manifests/sources/dist for 6 packages — `coop-view` and `governance-view` (16 API import sites) appear **nowhere**; web image never builds/copies `packages/common/dist` and `.dockerignore` excludes `dist/`; `docker-compose.prod.yml` builds from these Dockerfiles. |
| O-04 | CONFIRMED | Caddyfile has exactly three API handles (`/api/*`, `/health`, `/.well-known/*`) + catch-all → `web:3000`; SvelteKit has no `/xrpc` route ⇒ 404; label WebSocket cannot upgrade. |
| O-06 | CONFIRMED (spot-check) | `INSTANCE_ROLE` parsed in config; `grep instanceRole` over `apps/api/src` (non-test) → zero runtime consumers; identical consumers/jobs start in every role. |
| W-01 | CONFIRMED, worse | Exactly **27** legacy loaders with `redirect()` inside bare `try/catch`; because the 301 *throws from inside the try*, the catch fires **even on the success path** — every legacy URL unconditionally lands on `/me`; the coop-scoped redirect is dead code. (28th match is a form action that rethrows correctly.) |

### Findings that are worse than reported

1. **W-01:** success path also swallowed (see table) — not just the error path.
2. **A-01:** five lexicon docs silently excluded from the runtime validator because they would crash `new Lexicons()`; the test suite encodes this drift as expected behavior; `types.ts` claims to be generated but is hand-maintained.
3. **A-12/C-03:** the fake-CID `private_record` writer is wired **unconditionally** — `SPACES_CONSUMER_ENABLED=false` does not protect the write path; Tier 2 placement can silently degrade to the compatibility cache in production today.
4. **C-04:** the codebase contains the correct identity-binding primitive with a comment explaining exactly why body DIDs are attacker-controlled — used once, ignored by all five agreement endpoints.
5. **A-14 (new gap, not in the report):** `permissioned-conformance.ts` documents per-target wire dialects (PR-5187 `repo`/`since` vs HappyView `did`/`cursor`) but the XRPC adapters hardcode the PR-5187 dialect; nothing consumes the registry's `wire.*` parameters.
6. Minor scope corrections: S-03 (Stripe signatures escape logging due to mount order), C-05 (Tap-ack consequence inferred from rethrow contract rather than read directly).

### Codebase scale (measured)

11 workspace packages; 924 TS/Svelte files; ~152,400 lines (api 73.3K, web 37.0K, spaces-consumer 10.8K, db 7.1K, federation 6.6K, lexicons 5.9K, arbiter-client 4.5K, common 3.5K, coop-view 2.6K, governance-view 1.0K); 237 test files; `container.ts` = 761 lines wiring 86 container fields (53 `*Service`); 1 active DB migration (`0001_v11_baseline.ts` + 137KB `schema.sql`) with 63 archived.

## 2. Ecosystem Refresh (2026-08-01)

Every externally-checkable claim in the report verified accurate as of its stated cutoff (2026-07-31T21:41:49Z). Post-cutoff deltas:

1. **PR #5187 moved again:** 84 commits, 167 changed files, head `c5962d7ab23d0f42ccb835e7014a9d38f24ad002` (2026-07-31T23:27Z) — "tighten space scope validation": oauth-scopes space-permission, `com.atproto.simplespace.createSpace`, client-attestation verifier, `aturi` space syntax. Still open/draft/dirty. **CSN's pin `3f6c96d5` is now 10 commits behind.** The CAR-ordering contradiction (`packages/space/src/sync/provider.ts` DAG-CBOR order vs the `getRepo` lexicon's lexicographic order) was untouched by `c5962d7` and persists.
2. **Ground-truth wire surface at head** (code > proposal text):
   - `com.atproto.space.*` — 19 lexicons: record CRUD (`createRecord`, `putRecord`, `deleteRecord`, `applyWrites`, `getRecord`, `listRecords`); sync (`getRepo`, `getLatestCommit`, `listRepoOps`, `listRepos`, `listSpaces`, `getSpace`); credentials (`getSpaceCredential`, `getDelegationToken`); `getBlob`; notifications (`notifyWrite`, `registerNotify`, `notifySpaceDeleted`); `defs`.
   - `com.atproto.simplespace.*` — 8 lexicons: **the official PDS now ships a built-in reference space-authority** (`createSpace`, `updateSpace`, `deleteSpace`, `addMember`, `removeMember`, `listMembers`, `checkUserAccess`, `defs`), implemented in `packages/pds/src/api/com/atproto/simplespace/`. CSN already has an adapter seam: `packages/arbiter-client/src/xrpc-simplespace-management-client.ts`.
3. **HappyView `v2.12.0-dev.3`** published 2026-07-31T21:51:57Z (10 minutes after the report's cutoff): linked-repos support + `inherit_auth` SQLite fix. The differential fixture pin (`happyview-2.12.0-dev.2`) is now stale.
4. **Habitat** committed against the official `simplespace` surface on 2026-08-01 ("[Frontend] Use simplespaces listMembers" `3466444`, "[Spaces] Restore perm check for putRecord" `f3d5cbf`, "[Spaces] Fix CIDs" `44b3d40`) — independent validation that the simplespace surface is the integration direction.
5. **Forum discussions (Atmosphere Discourse):**
   - Topic 946 "Permissioned data proposal discussion" (dholms, Jul 3; bumped 2026-08-01): alpha PDS promised "in the next couple weeks" (explains the churn rate); `at://` vs `ats://` URI scheme unresolved; emerging usage pattern is "lots of spaces, one per logical object, cheap via `skey`"; identity-minimizing/generic `getSpaceCredential` feedback (≈ proposals issue #97); **new 08-01 objection** (webbeef): permissioned data drastically changes the PDS-operator trust/privacy threat model.
   - Topic 968 "Transitioning data from permissioned to public?": both directions unresolved; note the claim that the AT-URI shape stays space-free with PDS-internal space mapping, plus single-record-in-multiple-spaces ideas.
   - Topic 976 "Permissioned Data Adversarial Migration": malicious space-authority / credible-exit concern; community mitigation pattern is members co-writing copies to their own repos — validates CSN's Tier-2 copy-ledger direction.
   - Topic 1031 "Working group: service self-description" (ngerakines, Jul 31): 1 post, no lexicon, no implementation — still discussion/speculation, as the report classified it.
6. **Stable substrate unchanged:** npm `@atproto/api` 0.20.36, `@atproto/pds` 0.5.23, `@atproto/oauth-client-node` 0.5.1, `@atproto/sync` 0.3.15, `@atproto/oauth-scopes` 0.5.7 (all published 2026-07-30/31); `@atproto/space` unpublished (npm 404); Proposal 0016 text unchanged since `1caad93` (Jul 3); no Diary 8 (index still ends at Diary 7, Jul 17); IETF ATP charter still excludes non-public data.
7. **zicklag/Muni Town references** (from [docs/rag/zicklag-atproto-work.md](../rag/zicklag-atproto-work.md)): "The Arbiter — Group Management for Permissioned Spaces" (Apr 18) — standardized XRPC group-membership service layered on 0016; dedicated DID per community; roles=groups=spaces treated uniformly; 8-level cumulative access hierarchy; space-to-space delegation incl. cross-arbiter; requires no changes to Proposal 0016. "Making Roomy More ATProto-Native" (Mar 13) — community PDS repos, UCAN authorization, Leaf→Rivet migration; exploratory, no wire contract. Context: bnewbold "Community Spaces on AT Protocol" (Feb 5) — group accounts as DIDs, bidirectional membership records, trusted servers as interim until native permissioned data; AT Protocol Spring 2026 roadmap (Mar 24) — permissioned data is the major official focus through summer 2026.

**Conclusion:** the observed churn rate (three PR-head movements within 48 hours; independent implementers tracking the head within a day) confirms the report's posture — pin exact targets, keep wire details behind ports, treat nothing in Proposal 0016 as a stable dependency — and the report's remediation program is adopted rather than replaced.

## 3. Adopted Program

Gate 0 and Phases 1–8 of the 2026-07-31 report are adopted **by reference**, subject to the amendment register below. The report remains the authoritative source for phase contents, required tests, and exit criteria.

## 4. Amendment Register

- **AM-1 (user decision; affects C-02 / Gate 0 / Phase 7):** Scripting is retained as a product requirement — the report's "remove until required" recommendation is replaced. Gate 0 still disables script CRUD/test/enable routes and the worker pool immediately. The program adds a Phase-7-adjacent workstream: an isolated script runner **outside the API trust domain** — separate container/process; no ambient env or DB credentials; capability-scoped RPC surface derived from the existing `script-service` callback set (db.query/get/count, http.fetch, email.send, pds.createRecord, emitEvent); per-cooperative resource quotas; routes gated by the existing `hasRole('admin','owner')` middleware. In-process `node:vm` is never re-enabled.
- **AM-2 (user decision; affects L-01 / Phase 4):** Delegation semantics fixed to the report's recommended option: immutable per-proposal membership/delegation snapshot; represented voting power computed at close; each member's weight counts exactly once, with a direct vote overriding that member's delegated representation.
- **AM-3 (ecosystem; affects Phase 6):** The repin review covers **10** commits (`3f6c96d5..c5962d7`), adding to the report's nine-commit list: space-scope OAuth validation (`c5962d7`), the `simplespace` management surface, and `aturi` space-syntax changes. The HappyView differential pin advances to `v2.12.0-dev.3` (evaluate linked-repos support for fixture impact).
- **AM-4 (ecosystem; affects Phase 6 + Decision #8):** Authority hosting: the first-pilot target for group/space authority is conformance with the official `com.atproto.simplespace.*` surface (the reference space-authority inside `@atproto/pds`), using the existing `arbiter-client/xrpc-simplespace-management-client.ts` as the adapter seam; `CsnDbGroupDirectoryPort` remains the default until that surface stabilizes. Habitat's adoption is the ecosystem precedent. The Arbiter-style delegation model (roles=groups=spaces, space-to-space delegation) remains the application-layer policy target above it.
- **AM-5 (verification; affects Phase 6):** Make the XRPC adapters consume wire-dialect parameters (`repoParameter`, `oplogCursorParameter`, etc.) from the conformance-target registry (`permissioned-conformance.ts`) instead of hardcoding the PR-5187 dialect. The registry already documents the variants; nothing currently switches on it.
- **AM-6 (verification; affects Phase 2/6):** The `private_record` writer replacement (A-12) must: include full space identity (`arbiterDid|spaceKey|spaceType`) in the physical key; use real CIDs or an explicit non-CID marker type that cannot leak into `proposal.cid`/`vote.cid`; use TID-valid, record-key-safe rkeys; and be gated so Tier 2 placement cannot silently degrade to the compatibility cache in production (today it is wired unconditionally).
- **AM-7 (forum signals; standing constraints):** (a) Do not bake any space-URI shape into storage keys or lexicons while `at://` vs `ats://` is unresolved — `SpaceRef` stays the identity type behind ports (reinforces M-13). (b) Do not design or promise permissioned→public "publish later" flows until topic-968-class semantics settle. (c) Keep the Tier-2 copy-ledger / member-copy pattern as the credible-exit mechanism (topic 976 validates it). (d) The PDS-operator-trust objection (topic 946, webbeef) reinforces the three-tier model: Tier 3 (E2EE) remains the only tier for content that must survive a hostile operator.
- **AM-8 (session hygiene):** All implementation sessions launch with cwd = `/Users/alan/projects/utm/vmshared/coopsource.network`. The stale clone at `~/projects/coopsource.network` (475 commits behind; V5-era CLAUDE.md) is left untouched and must never supply the loaded project context for V12+ work.

## 5. Decision Register

From the report's "Decisions Required Before Approval":

| # | Decision | Status | Blocks |
|---|---|---|---|
| 1 | Scripting | **Decided:** keep, properly isolate (AM-1) | Gate 0 wording; Phase 7 workstream |
| 2 | Governance delegation | **Decided:** snapshot at close, each member once (AM-2) | Phase 4 |
| 3 | Governance record model (mutable CAS vs immutable + events) | **Open** | Phase 2 (lexicon repair) |
| 4 | Admission default (invite-only / request-approval / open) | **Open** | Phase 1 (registration enforcement) |
| 5 | Finance visibility roles | **Open** | Phase 1 (read permissions) |
| 6 | Persistent data (disposable PoC vs append-only migrations) | **Open** (report recommends append-only before any pilot) | Phase 7 |
| 7 | CSN as OAuth resource server (third-party XRPC callers?) | **Open** | Phase 2 (XRPC/OAuth repair) |
| 8 | Authority hosting | **Direction set:** official `simplespace` surface as pilot target (AM-4); pilot detail open | Phase 6 |
| 9 | Tier 2 retention/deletion policy | **Open** | Phase 5/6 activation |
| 10 | Network joining approval | **Open** (report recommends: yes, pending consent + explicit acceptance) | Phase 1 |

## 6. Approval Gates

Per the report's checkpoint structure, unchanged: approve Gate 0 + Phase 1 first; canonical record/governance decisions (#3, #4, #5) before Phase 2; durable-ingestion design review before Phase 3; finance/legal (Phase 5) and Proposal 0016 activation (Phase 6) as independent signoffs; nothing is "deployable" until Phase 7 exit criteria pass.

**No implementation tranche is authorized by this document** (user decision 2026-08-01). The smallest safe first tranche remains the report's Gate 0 + P0 set — public-governance acceptance gate, role-assignment ceiling, invite enforcement, request-log redaction, webhook scoping, script-route disable, with regression tests — awaiting separate approval.

## 7. Sources Appendix (pins observed 2026-08-01)

- Proposal 0016: https://github.com/bluesky-social/proposals/tree/main/0016-permissioned-data — path head `1caad93` (2026-07-03), unchanged.
- ATProto PR #5187: https://github.com/bluesky-social/atproto/pull/5187 — open/draft/dirty; 84 commits; head `c5962d7ab23d0f42ccb835e7014a9d38f24ad002` (2026-07-31T23:27Z). Prior heads within 48h: `3f6c96d5` (CSN pin) → `b76a4cf1` (report cutoff) → `c5962d7`.
- Proposals issues: https://github.com/bluesky-social/proposals/issues/97 (generic getSpaceCredential), https://github.com/bluesky-social/proposals/issues/98 (cross-host blob GC) — both open, unchanged since 07-31.
- npm (published timestamps): `@atproto/api` 0.20.36, `@atproto/pds` 0.5.23, `@atproto/oauth-client-node` 0.5.1, `@atproto/sync` 0.3.15 (2026-07-31T11:52Z); `@atproto/oauth-scopes` 0.5.7 (2026-07-30); `@atproto/space` — 404.
- HappyView: https://github.com/gamesgamesgamesgamesgames/happyview/releases — `v2.12.0-dev.3` 2026-07-31T21:51:57Z; stable `v2.11.8`.
- Habitat: https://github.com/habitat-network/habitat — commits `f3d5cbf`, `3466444`, `44b3d40`, `c1dea00` (2026-08-01).
- Stratos: https://github.com/NorthskySocial/stratos — admin list-enrollments merged 2026-07-31 (#111).
- Atmosphere Discourse: https://discourse.atmosphere.community/ — topics 946 (permissioned data discussion), 968 (permissioned→public), 976 (adversarial migration), 1031 (service self-description WG).
- Holmgren diary index: https://dholms.leaflet.pub/ — ends at Diary 7 (2026-07-17).
- zicklag: https://zicklag.leaflet.pub/3mjrvb5pul224 (The Arbiter, Apr 18), https://zicklag.leaflet.pub/3mgy2sbswl22f (Roomy ATProto-native, Mar 13).
- bnewbold: https://bnewbold.leaflet.pub/3me3ea64bhk26 (Community Spaces on AT Protocol, Feb 5).
- AT Protocol Spring 2026 roadmap: https://atproto.com/blog/2026-spring-roadmap (Mar 24).
