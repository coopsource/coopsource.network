# V12 Phase 3 — Arbiter Convergence + Membership Reads Through the Port

> **Progress (2026-07-05):** Merged to main — Task 3.1 (roster truncation), 3.1b (visibility opt-in endpoint), 3.2 bug slice (active-member filter divergence), 3.3 (lifecycle events), 3.4 (consent-indexer hardening), 3.5 (suspension), 3.7 partial (single-use local invitation redemption), and 3.9 Issue B (Supertest listener flake). **Remaining:** 3.2 architectural read seam (design first, then migrate direct membership reads), 3.6 DID-rotation-aware equality before enabling the spaces consumer, 3.7 completion for public/OAuth invite acceptance, and 3.8 XRPC arbiter adapter once a real or stable-enough target exists.

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes. Each task ends with an independently testable deliverable. TDD throughout: failing test → run-red → implement → run-green → commit.

**Goal:** Complete the membership authority seam — route membership _reads_ through `GroupDirectoryPort` (writes already go through `GroupMutationPort`), converge the CSN-DB adapters toward the draft `town.muni.arbiter.*` contract, and resolve the verified pre-merge review findings that belong to the membership layer.

**Branch:** `feature/v12-phase-3-arbiter-convergence` (already created). Merge `--no-ff` + tag `v12-phase-3` when green.

**Architecture:** ARCHITECTURE-V12 §4–§5, §10, plus `docs/plans/2026-07-05-v12-replan-after-code-deep-dive.md` and `docs/plans/2026-07-05-v12-membership-read-seam-design.md`. This phase closes the "half-drawn seam": today writes flow through the port but application reads still hit `membership`/`membership_role` directly. The active-status filter bug is fixed; the remaining work is architectural.

**Tech stack:** unchanged (TS strict, Kysely, Vitest 4).

## Global constraints

- DIDs authoritative; consult `did_rotation_history` on DID equality (Task 3.6).
- Errors name the authorization axis. Fail closed on partial/stale resolution.
- Schema changes edit `packages/db/src/schema.ts` AND regenerate `migrations/schema.sql`; no new migration files.
- Reads move behind ports; the CSN-DB adapter keeps serving them from the projection so behavior is unchanged except where a finding requires a fix.
- Every task: `pnpm build && pnpm --filter <pkg> test`; full `pnpm test` before merge.

## Decision recorded (user, 2026-07-04)

**V2 (invitation auto-activation): KEEP immediate-active — no approval checkpoint.** Rationale: the decision to admit the member was already made (often voted) at invite-send time, so re-approval on acceptance is redundant. The requirement is not a second approval but a _safe acceptance_: (a) the acceptance is authoritatively from the invited party, and (b) it responds to a specific invitation the cooperative actually issued — never an arbitrary "acceptance" from an unknown actor.

This is the standard **addressed, single-use invitation** pattern, and the schema already supports it (`invitation.invitee_did`, `invitee_email`, `token`, `status`, `invalidated_at`). Task 3.7 implements the three properties that make immediate-active safe against a leaked token; it does NOT add a checkpoint.

---

## Task 3.1: Roster resolution must report truncation (review finding V4)

**Files:** Modify `packages/arbiter-client/src/csn-db-group-directory-port.ts` (`loadMembers` ~152–183, `resolveSpaceMembers` ~134–150); Test `packages/arbiter-client/src/__tests__/csn-db-group-directory-port.test.ts`.

**Problem:** `loadMembers` caps at `.limit(pageSize())` (default 5000) but `resolveSpaceMembers` hardcodes `partial:false`/`stale:false` and ignores `consistency:'strict'`. For a >5000-member coop the consumer cross-checks against a silently partial list (member #5001's records rejected as not-member) and the fail-closed-on-partial guard can never trip.

**Interfaces produced:** `resolveSpaceMembers` returns `partial: true` when any constituent `loadMembers` call hit the page cap; under `consistency:'strict'`, either paginate to completion or return `partial:true` (never a silently truncated `partial:false`).

- [ ] Failing test: seed `pageSize+1` active members; assert `resolveSpaceMembers({consistency:'strict'})` returns `partial:true` (or the full set), and that member #(pageSize+1) is present in the resolved list.
- [ ] Implement: query `limit(pageSize()+1)`; if the extra row is present, drop it and set a `truncated` flag; either loop pages under `strict` or surface `partial:true`. Thread `truncated` into the `resolveSpaceMembers` return.
- [ ] Green + commit `fix(arbiter-client): report partial resolution on roster truncation (V4)`.

## Task 3.2: Membership reads through the read seam

**Files:** Design doc now exists at `docs/plans/2026-07-05-v12-membership-read-seam-design.md`. Next add the minimum API-layer read facade/port and adapter code required to migrate direct readers. Expected implementation touches `apps/api/src/services/membership-service.ts`, `network-service.ts`, governance/profile/reporting/AI/MCP/script readers surfaced by `rg`, and tests alongside each.

**Problem (review altitude):** Direct reads are spread across the API layer. The original filter-divergence bug is already fixed, but the axis boundary is still wrong: application services continue to decide membership by querying projection tables directly instead of going through a single authority seam.

**2026-07-05 correction:** do **not** push display names, profiles, quorum, vote weights, member classes, or cooperative-specific eligibility into the package-level `GroupDirectoryPort`. Keep Layer 2 generic (`resolveSpaceMembers`, direct DIDs/access, partial/stale metadata). Add an API-layer membership read facade that composes the directory answer with local projection/profile/governance tables where needed.

- [ ] Enumerate read sites with `rg "selectFrom\\('membership'\\)|selectFrom\\('membership_role'\\)" apps/api/src` and record the inventory in the PR/design doc.
- [ ] Design the read seam before code migration: security-critical permission checks, roster/count/profile reads, governance eligibility/quorum/vote-weight reads, and utility/reporting/AI reads each need explicit return types.
- [ ] Encode the canonical active-member filter (`status='active' AND invalidated_at IS NULL`) once in the seam/adapter; keep fail-closed behavior for partial/stale directory resolution.
- [ ] Migrate in risk order: auth/middleware/permissions first; roster/count/profile reads second; governance reads third; utility/reporting/AI/MCP/script reads last.
- [ ] Keep the CSN-DB adapter serving from the projection until a real Arbiter server exists. Direct membership access after this task should be limited to low-level adapters/tests/helpers.
- [ ] Green per moved slice; commit incrementally with messages like `refactor(api): route security membership reads through authority seam`.

## Task 3.1b: Directory-visibility opt-in path (review finding #5)

**Files:** a member-facing route to set own `directory_visible`; `membership-service.ts`; Test.

**Context:** directory-visible defaults to `false` (opt-in — user decision 2026-07-04) and the audit/insert defaults were aligned (`d1ee942`). But there is **no endpoint for a member to opt IN**, so opt-in is currently unreachable. Add a member-facing route (e.g. `PATCH /coop/:did/members/me/visibility`) letting an active member set their own `directory_visible`; do not let members set others' visibility.

- [ ] Failing test: member sets visibility true → appears in `listMembers`; false → hidden.

**Also note (done in the Fable-5 review pass, `v12-review-fixes`):** the federation approve-authority is now centralized on the permission model via `didHasPermission(db, coopDid, did, 'member.approve')` in `apps/api/src/middleware/permissions.ts`. Use this SAME pattern when routing membership reads/writes through the port in Task 3.2 — do not reintroduce hardcoded role lists. `owner` is now a real built-in role (`*`).

## Task 3.3: Membership lifecycle events (review finding V5)

**Files:** Modify the membership write path so `member.joined`/`member.departed` (and `member.approved` if kept) emit; likely `apps/api/src/services/membership-service.ts` + the `addMember`/`removeMember` call sites (setup, auth, network, federation). Tests assert emission.

**Problem:** V9's indexers were the only emitters; they were rewritten/gutted, so the events advertised in `EVENT_CATALOG` and the web `TriggerPanel` never fire — webhooks/agent-triggers/SSE dashboards are silently dead on join/depart.

**Design note:** emit at the _service_ layer where the event bus is available (the port in `packages/arbiter-client` has no bus dependency — do not add one). Emit once per logical join/depart, not per call site duplicated.

- [ ] Failing test: a join through `membershipService` emits exactly one `member.joined` with `{did, cooperativeDid}`; a removal emits one `member.departed`.
- [ ] Implement emission in the service path; ensure setup/auth/network/federation joins all flow through it (or emit at each with a shared helper — no duplicates).
- [ ] Reconcile `EVENT_CATALOG` and `TriggerPanel` with what's actually emitted (drop `member.approved` if V2 decision removes approval).
- [ ] Green + commit `fix(api): emit member.joined/departed from the membership write path (V5)`.

## Task 3.4: Harden the firehose consent indexer (review findings V10, A2-1, A2-2, A2-4)

**Files:** Modify `apps/api/src/appview/indexers/membership-indexer.ts` (`indexMemberConsent`); `packages/spaces-consumer/src/consumer.ts` (metric); Tests.

- [ ] **V10:** verify consent evidence before letting a firehose `memberConsent` record overwrite the join-verified `member_record_uri/cid`, OR refuse firehose overwrites of an already-verified pointer. Failing test: a member self-publishes a fresh consent record; assert the stored verified pointer is not silently replaced by an unverified one.
- [ ] **A2-1:** fix the delete branch `.where('member_record_cid','=',event.cid)` — the firehose sets `cid=''` on deletes, so it never matches; match on `member_did` (+ uri) instead. Test with a delete op carrying `cid=''`.
- [ ] **A2-2:** remove the dead `event.prevCid` branch (decoder never populates it).
- [ ] **A2-4:** in `consumer.ts` stop counting expected not-member rejections as `memberCrossCheckFailures`; reserve that metric for indeterminate/partial-resolution failures. Test the counter distinction.
- [ ] Green + commit `fix(api): harden firehose consent indexer + cross-check metric (V10/A2-*)`.

## Task 3.5: Suspension mechanism (review finding V3)

**Files:** Add a suspend/reinstate operation to `packages/arbiter-client/src/group-mutation-port.ts` + `CsnDbGroupMutationPort`; wire an admin route; Tests. **Or** formally retire label-based suspension (remove the `member-suspended` label assumption) — decide with the read of §governance-labeler.

**Problem:** V9's approval-revocation was the only `status='suspended'` writer; it's gone, so suspension is unreachable while the labeler and vote-eligibility still assume it exists.

- [ ] Decide: reinstate a first-class suspend op (recommended — suspension ≠ removal) vs retire the concept.
- [ ] If reinstating: failing test for `suspendMember`/`reinstateMember` transitions (active↔suspended, roles preserved on suspend, audit event); implement; wire the admin route with an Axis-2/Axis-3 authority check (mirror the federation approve gate).
- [ ] Green + commit.

## Task 3.6: DID rotation lookup in the accept path (review finding V9)

**Files:** `packages/spaces-consumer/src/consumer.ts` (`handleRecord` DID-equality ~145); a rotation-history reader (new port method or `did_rotation_history` query behind the directory port); Tests.

**Gate:** this must be done before `SPACES_CONSUMER_ENABLED` is ever flipped on. Currently flag-gated off + log-only, so it is a correctness-before-activation task, not a live fix.

- [ ] Failing test: a rotated member DID (old→new in `did_rotation_history`) whose record's `authorDid` is the old DID is accepted (not rejected as not-member) when the member list carries the new DID.
- [ ] Implement rotation-aware equality (resolve both sides through `did_rotation_history`) in the accept path.
- [ ] Green + commit `fix(spaces-consumer): rotation-aware DID equality in accept path (V9)`.

## Onboarding model (user decision 2026-07-04, community-aligned)

Constraints: match ATProto community convention; give users options; **no email backend** (must deploy and have friends try it without SMTP config); minimize developer friction.

Community norm as of 2026 (sources: atproto.com/specs/oauth; bluesky-social/atproto discussion #4587 "OAuth-based account creation", Jan 2026; docs.bsky.app/blog/oauth-atproto): **OAuth bring-your-own-identity is the idiomatic path** — the app never collects email/passwords; users authenticate as an existing DID via OAuth. The ecosystem is actively moving account _creation_ to OAuth too (`prompt=create`, experimental), and explicitly criticizes apps that collect email+password (which is exactly what CSN's current `register()` does). Invite codes are a PDS-level gating mechanism, not app email.

**CSN onboarding (in priority order):**

1. **OAuth bring-your-own-DID — primary/idiomatic.** Invitee already has an ATProto identity (Bluesky or any PDS); they accept an invite by OAuth sign-in. DID-authoritative by construction (the OAuth flow proves DID control), so it directly satisfies "authoritatively from the invited party." Zero email, zero password, zero SMTP. CSN already has `oauthClient`/`memberWriteProxy`/`operatorWriteProxy` (V9) to build on. **This is the friction-free "friends try it out" path** — a friend with a Bluesky account just signs in.
2. **Local email+password account — fallback only, for the identity-less.** Keep the existing `register()` as a stopgap, clearly marked non-idiomatic and slated to retire in favor of OAuth account creation (#4587) when it standardizes. Critically it needs **no email _sending_** — email is a stored login credential, not a send channel.
3. **Invites are single-use links/codes shared out-of-band** (operator copies + hands over via DM/paste). The server never sends email. `invitee_email` becomes optional metadata, never a required channel. → **satisfies "no email backend to deploy."**

**Phase split:** the OAuth bring-your-own-DID _accept_ flow overlaps the OAuth work — scope it against the existing `oauthClient` login surface first. If the OAuth login/callback is already wired for existing users, invite-accept-via-OAuth can land in Task 3.7; otherwise it moves to Phase 4 (OAuth-spaces seam) and Task 3.7 hardens the local + out-of-band-link paths now. Do not collect email/passwords for OAuth users.

## Task 3.7: Harden invitations — addressed, single-use, reference-bound (keep immediate-active)

**Files:** `apps/api/src/services/auth-service.ts` (`register()` invitation path ~44–76, 175–186); `apps/api/src/routes/org/memberships.ts` (`/invitations/:token/accept` ~320–330); possibly `apps/api/src/services/consent-evidence-verifier.ts` (bind acceptance consent to the invitation); Tests.

**2026-07-05 code-reality note:** `AuthService.register()` now enforces bootstrap email addressee binding and atomic single-use consume. The public `/api/v1/invitations/:token/accept` route is still incomplete: it has no email/DID/OAuth binding, and it creates DID/PDS-consent artifacts before the conditional consume, so a losing concurrent redemption can still leave orphan external artifacts even though membership is protected. Finish this path or explicitly move OAuth BYO-DID acceptance to Phase 4.

Three properties turn the bearer token into an addressed, unforgeable, one-time credential — immediate-active stays, the leaked-token hole closes:

1. **Addressee binding — DID-bound is canonical; email is a bootstrap-only fallback.** (User decision 2026-07-04: the DID is the durable identity — it derives from PLC keys and resolves to a DID doc; CSN's email/password is a separate login credential (`auth_credential.entity_did`) that merely _references_ the DID and is one swappable reach channel. Bind to identity, not to the reach channel.)

   Two invitation kinds, both already expressible in the schema (`invitee_did` / `invitee_email`):
   - **Bound invite (`invitee_did` set) — primary/idiomatic.** The coop is inviting a known identity: an existing CSN member, a bring-your-own ATProto user, or a cooperative-as-member (the recursive coop→network / user→coop cases are _inherently_ DID-to-DID — email could never bind them). Acceptance requires **authoritative control of that DID**: a local session already authenticated as it, an OAuth token for it (Axis 1), or a `memberConsent` record authored by it (the `consentEvidenceVerifier` author check already provides this). A leaked token is useless to anyone who can't prove they are `invitee_did`.
   - **Bootstrap invite (`invitee_email` set, no DID yet) — net-new humans only.** `register()` mints the DID at redemption, so a brand-new invitee has no DID to bind at send time. Here email possession is the bootstrap factor: require registration `email === invitee_email` (case-insensitive). On success, **capture the freshly-minted DID into `invitee_did`** so the record is complete and all subsequent authority is DID-based. Explicitly the weaker path; document it as such.
   - [ ] Failing test (bound): invite `invitee_did=did:plc:alice`; accept authenticated as `did:plc:mallory` → rejected; as `did:plc:alice` → active.
   - [ ] Failing test (bootstrap): invite `invitee_email=alice@coop`; register `mallory@evil` → rejected; `alice@coop` → active, and `invitee_did` is backfilled with the new DID.

   **Direction (flag for Phase 4/5, do not block Task 3.7):** the most ATProto-native onboarding is bring-your-own-DID — an existing-identity human accepts with their own DID via OAuth, no CSN-minted `did:plc` and no email/password at all. `register()` currently always mints a new `did:plc`; a BYO-DID accept path (OAuth-based, Axis 1) makes the bound path first-class for humans, not just the recursive machinery. Design the invite model to accommodate it now (the `invitee_did` kind already does); implement the accept surface with the OAuth-spaces seam work.

2. **Atomic single-use consume.** Replace the read-then-later-mark (`register()` marks accepted at ~176, after member creation) with a conditional UPDATE executed **before** member creation, in the same transaction: `UPDATE invitation SET status='accepted', invitee_did=?, invalidated_at=now WHERE id=? AND status='pending' AND invalidated_at IS NULL RETURNING id`. Zero rows affected → the invitation was already consumed/expired → reject. Kills replay and concurrent double-redemption.
   - [ ] Failing test: two concurrent redemptions of the same token → exactly one succeeds, the other 4xx; a second sequential redemption of a consumed token → rejected.
3. **Reference binding (requirement b).** Acceptance must cite a real, open, coop-issued invitation (not an arbitrary consent). Local path: the token lookup already establishes this; ensure the `memberConsent` acceptance record's `invitationId`/reference is checked so no membership is created from a consent that doesn't correspond to an issued invitation. Cross-instance path: `consentEvidenceVerifier` for `invitationAcceptance` should additionally confirm the referenced invitation exists and is addressed to the accepter.
   - [ ] Failing test: an `invitationAcceptance` consent that references no issued invitation (or one addressed to someone else) → rejected.

Also: the expiry check already exists (keep it) and expired/consumed invitations must not resurrect. After this task, `member.approved` (Task 3.3) is dropped from the catalog — there is no approval step.

**Residual risk note (document in the PR):** for a _new-account_ invite the only binding factor is email possession, so a party who intercepts the invite email can still redeem before the invitee. That is the normal invite-email threat model; coops needing stronger assurance should issue `invitee_did`-bound invites (existing-ATProto path), which require authoritative DID control. No approval checkpoint is needed for either.

## Task 3.8: XRPC GroupDirectoryPort adapter (convergence)

**Files:** Add `packages/arbiter-client/src/xrpc-group-directory-port.ts` implementing `GroupDirectoryPort` against `town.muni.arbiter.resolveSpaceMembers`/`listSpaces`/`getSpaceConfig`; env-selected (`GROUP_DIRECTORY_ADAPTER=csn-db|xrpc`, default `csn-db`); Tests against a mock arbiter.

**Gate:** re-check the watchlist first — if Muni Town has shipped a real arbiter server, add an integration test against it; if not, target the draft lexicon shapes and keep the CSN-DB adapter as default. HappyView 2.10 (`com.atproto.space.*`) is a candidate harness for the _spaces_ side (not the arbiter side).

- [ ] Failing test: `XrpcGroupDirectoryPort.resolveSpaceMembers` maps a mock `town.muni.arbiter.resolveSpaceMembers` response into `ResolvedMembers`, preserving `partial`/`stale`.
- [ ] Implement behind the port; wire env selection in the container; default stays `csn-db`.
- [ ] Green + commit.

## Task 3.9: Test-DB flakiness — two issues

**Issue A (cross-suite port collision) — DONE.** The federation Docker Postgres published on host 5432, colliding with the Homebrew Postgres the api suite uses. Fixed on `main` (`eaa57ab`): compose host port parameterized (`POSTGRES_HOST_PORT`, default 5432), federation global-setup publishes it on 5433. Verified federation 120/120 with the two instances on separate ports.

**Issue B (intra-api Supertest listener flake) — RESOLVED ON MAIN (`v12-phase-3-task-3.9b`).** Root cause was not DB state. `createTestApp()` passed the Express app directly to `supertest.agent(app)`, which made Supertest open a fresh ephemeral `http.Server` for each request and close it after the request. In long serial runs that rapid listen/close cycle occasionally sent the next request to a local port that had already been reused by another process; captured failures showed responses such as `404 page not found` and `Invalid CSRF token` with no matching Express request log, including a failed request to `127.0.0.1:62056` while a `language_` process owned that port.

Fix: `createTestApp()` now starts one owned listener per test app and passes that server to Supertest, while a Vitest setup file closes open test servers at the end of each test file. Verification: `@coopsource/api` typecheck passed; the narrowed repro (`search`, `explore`, `me-matches`) passed 20/20 before final cleanup and 5/5 after final cleanup; the full api suite passed 3/3 consecutive runs after final cleanup (`82 files`, `845 tests` each).

- [x] Root-cause the varying 403/404/timeout/socket failures.
- [x] Fix at the test harness boundary without retries or product-code changes.
- [x] Verify repeated narrowed repro and repeated full `@coopsource/api` suite runs.

---

## Self-review

- Covers every membership-layer review finding (V3, V4, V5, V9, V10, A2-1/2/4, read-seam) + arbiter convergence + the known test flake. V2 is a user-gated decision, correctly not auto-resolved. V8 (dormant fed client) and V11/V12/reuse cleanups belong to Phase 6 / Phase 2 respectively and are out of scope here.
- Each task is independently testable and independently revertible.
- Ordering: 3.1/3.4/3.6 (substrate correctness) and 3.2/3.3/3.5 (service seam) are largely independent; 3.8 (XRPC adapter) depends on 3.1's `partial` contract; 3.9 (infra) any time.
