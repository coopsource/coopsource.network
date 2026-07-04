# V12 Phase 3 — Arbiter Convergence + Membership Reads Through the Port

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes. Each task ends with an independently testable deliverable. TDD throughout: failing test → run-red → implement → run-green → commit.

**Goal:** Complete the membership authority seam — route membership *reads* through `GroupDirectoryPort` (writes already go through `GroupMutationPort`), converge the CSN-DB adapters toward the draft `town.muni.arbiter.*` contract, and resolve the verified pre-merge review findings that belong to the membership layer.

**Branch:** `feature/v12-phase-3-arbiter-convergence` (already created). Merge `--no-ff` + tag `v12-phase-3` when green.

**Architecture:** ARCHITECTURE-V12 §4–§5, §10. This phase closes the "half-drawn seam": today writes flow through the port but ~35 read sites hit `membership`/`membership_role` directly with divergent filters.

**Tech stack:** unchanged (TS strict, Kysely, Vitest 4).

## Global constraints

- DIDs authoritative; consult `did_rotation_history` on DID equality (Task 3.6).
- Errors name the authorization axis. Fail closed on partial/stale resolution.
- Schema changes edit `packages/db/src/schema.ts` AND regenerate `migrations/schema.sql`; no new migration files.
- Reads move behind ports; the CSN-DB adapter keeps serving them from the projection so behavior is unchanged except where a finding requires a fix.
- Every task: `pnpm build && pnpm --filter <pkg> test`; full `pnpm test` before merge.

## ⚠️ Decision gate before starting (user)

**V2 (invitation auto-activation):** `auth-service.register()` and `/invitations/:token/accept` now create `status='active'` immediately with the invite's `intended_roles`, removing V9's pending→approve checkpoint. **Confirm with the user whether this is intended** before Task 3.7. If they want the checkpoint back, Task 3.7 restores a `pending` state + approval transition; if not, Task 3.7 is dropped and the dead `approveInvitation`/`member.approved` paths are removed instead. Do not guess.

---

## Task 3.1: Roster resolution must report truncation (review finding V4)

**Files:** Modify `packages/arbiter-client/src/csn-db-group-directory-port.ts` (`loadMembers` ~152–183, `resolveSpaceMembers` ~134–150); Test `packages/arbiter-client/src/__tests__/csn-db-group-directory-port.test.ts`.

**Problem:** `loadMembers` caps at `.limit(pageSize())` (default 5000) but `resolveSpaceMembers` hardcodes `partial:false`/`stale:false` and ignores `consistency:'strict'`. For a >5000-member coop the consumer cross-checks against a silently partial list (member #5001's records rejected as not-member) and the fail-closed-on-partial guard can never trip.

**Interfaces produced:** `resolveSpaceMembers` returns `partial: true` when any constituent `loadMembers` call hit the page cap; under `consistency:'strict'`, either paginate to completion or return `partial:true` (never a silently truncated `partial:false`).

- [ ] Failing test: seed `pageSize+1` active members; assert `resolveSpaceMembers({consistency:'strict'})` returns `partial:true` (or the full set), and that member #(pageSize+1) is present in the resolved list.
- [ ] Implement: query `limit(pageSize()+1)`; if the extra row is present, drop it and set a `truncated` flag; either loop pages under `strict` or surface `partial:true`. Thread `truncated` into the `resolveSpaceMembers` return.
- [ ] Green + commit `fix(arbiter-client): report partial resolution on roster truncation (V4)`.

## Task 3.2: Membership reads through GroupDirectoryPort

**Files:** Add read methods to `packages/spaces-consumer/src/group-directory-port.ts` (or a sibling read port) + `CsnDbGroupDirectoryPort`; Modify `apps/api/src/services/membership-service.ts` (`selectFrom('membership')` at 38/104/247), `network-service.ts`, and other direct readers surfaced by grep; Tests alongside each.

**Problem (review altitude):** ~35 direct reads with divergent filters — `listMembers` shows non-active members (`invalidated_at is null` only) while `network-service` and the coop-profile count require `status='active'`. A coop's member list and its member count disagree.

- [ ] Enumerate read sites: `grep -rn "selectFrom('membership')\|selectFrom('membership_role')" apps/api/src` — record the list in the PR.
- [ ] Decide the canonical active-member filter (`status='active' AND invalidated_at IS NULL`) and encode it once in the port; failing test asserts `listMembers` and the coop member-count agree for a coop with a departed member.
- [ ] Route `membership-service` reads (and the federation coop-profile count) through the port method; keep the CSN-DB adapter serving from the projection.
- [ ] Green per moved site; commit incrementally `refactor(api): route membership reads through GroupDirectoryPort`.

## Task 3.3: Membership lifecycle events (review finding V5)

**Files:** Modify the membership write path so `member.joined`/`member.departed` (and `member.approved` if kept) emit; likely `apps/api/src/services/membership-service.ts` + the `addMember`/`removeMember` call sites (setup, auth, network, federation). Tests assert emission.

**Problem:** V9's indexers were the only emitters; they were rewritten/gutted, so the events advertised in `EVENT_CATALOG` and the web `TriggerPanel` never fire — webhooks/agent-triggers/SSE dashboards are silently dead on join/depart.

**Design note:** emit at the *service* layer where the event bus is available (the port in `packages/arbiter-client` has no bus dependency — do not add one). Emit once per logical join/depart, not per call site duplicated.

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

## Task 3.7: (conditional on V2 decision) invitation approval checkpoint

Only if the user wants the pending→approve checkpoint restored. Otherwise: remove the now-dead `approveInvitation` path and `member.approved` event. See the decision gate above.

## Task 3.8: XRPC GroupDirectoryPort adapter (convergence)

**Files:** Add `packages/arbiter-client/src/xrpc-group-directory-port.ts` implementing `GroupDirectoryPort` against `town.muni.arbiter.resolveSpaceMembers`/`listSpaces`/`getSpaceConfig`; env-selected (`GROUP_DIRECTORY_ADAPTER=csn-db|xrpc`, default `csn-db`); Tests against a mock arbiter.

**Gate:** re-check the watchlist first — if Muni Town has shipped a real arbiter server, add an integration test against it; if not, target the draft lexicon shapes and keep the CSN-DB adapter as default. HappyView 2.10 (`com.atproto.space.*`) is a candidate harness for the *spaces* side (not the arbiter side).

- [ ] Failing test: `XrpcGroupDirectoryPort.resolveSpaceMembers` maps a mock `town.muni.arbiter.resolveSpaceMembers` response into `ResolvedMembers`, preserving `partial`/`stale`.
- [ ] Implement behind the port; wire env selection in the container; default stays `csn-db`.
- [ ] Green + commit.

## Task 3.9: Fix the federation/api test DB-port collision (infra)

**Files:** `packages/federation/tests/global-setup.ts` and/or `infrastructure/docker-compose.yml` port mapping / `apps/api/tests/helpers/test-db.ts`.

**Problem:** the federation suite starts docker postgres on host `5432`, colliding with the homebrew postgres the api suite uses → intermittent `api#test` failure in full `pnpm test` (turbo serialization only partly mitigates). Per-package runs are green.

- [ ] Move the docker federation postgres to a non-5432 host port (e.g. 5433) and point federation's connection string at it, or make the api suite use an isolated instance. Verify 5× consecutive green full `pnpm test --force`.
- [ ] Commit `fix(test): isolate federation docker postgres from the api test DB (5432 collision)`.

---

## Self-review

- Covers every membership-layer review finding (V3, V4, V5, V9, V10, A2-1/2/4, read-seam) + arbiter convergence + the known test flake. V2 is a user-gated decision, correctly not auto-resolved. V8 (dormant fed client) and V11/V12/reuse cleanups belong to Phase 6 / Phase 2 respectively and are out of scope here.
- Each task is independently testable and independently revertible.
- Ordering: 3.1/3.4/3.6 (substrate correctness) and 3.2/3.3/3.5 (service seam) are largely independent; 3.8 (XRPC adapter) depends on 3.1's `partial` contract; 3.9 (infra) any time.
