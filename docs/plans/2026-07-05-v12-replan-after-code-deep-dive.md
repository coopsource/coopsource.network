# CSN V12 Re-Plan After Code And Ecosystem Deep Dive

**Date:** 2026-07-05
**Status:** Active planning addendum. This document does not replace
`ARCHITECTURE-V12.md`; it records code-reality corrections and a new execution
order for the next slices. Where this document and older task plans disagree,
update the canonical docs before implementing.

## Purpose

The archived handoff in
`docs/archive/handoff-2026-07-05-v12-program.md` is directionally right: Phase 3
is still the current phase, Task 3.9B is resolved, and the remaining meaningful
architecture work is the membership read seam. After reading the canonical docs
and checking the codebase, there are also several concrete doc/code and
ecosystem/code mismatches that should be fixed before further feature work.

The most important planning change: do not treat Phase 3 as a mechanical grep
replacement. The current `GroupDirectoryPort` answers space membership as
DIDs/access, while many application reads need profiles, roles, classes,
counts, vote weights, and permission resolution. The next slice must design the
read model first, then migrate callers.

## Inputs Read

- `docs/archive/handoff-2026-07-05-v12-program.md`
- `ARCHITECTURE-V12.md`
- `docs/plans/2026-07-04-v12-program-plan.md`
- `docs/superpowers/plans/2026-07-04-v12-phase-3-arbiter-convergence.md`
- `docs/plans/2026-07-04-atproto-shared-spaces-research.md`
- `docs/plans/2026-07-04-v11-merge-review-findings.md`
- `CLAUDE.md`
- `AGENTS.md`
- Core code paths in `packages/spaces-consumer`, `packages/arbiter-client`,
  `apps/api/src/container.ts`, membership/auth/governance/network services,
  XRPC handlers, test harness, DB schema, and V9 retirement targets.

## External Refresh, 2026-07-05

Primary sources checked:

- [Proposal 0016: Permissioned Data](https://github.com/bluesky-social/proposals/blob/main/0016-permissioned-data/README.md)
- [Proposal PR #94](https://github.com/bluesky-social/proposals/pull/94)
- [Implementation PR #5187](https://github.com/bluesky-social/atproto/pull/5187)
- [Permissioned data proposal discussion](https://discourse.atprotocol.community/t/permissioned-data-proposal-discussion/946)
- [Arbiter thread](https://discourse.atprotocol.community/t/750)
- [Lexicon Garden: town.muni.arbiter](https://lexicon.garden/browse/town.muni.arbiter)
- [HappyView 2.10](https://happyview.dev/blog/happyview-2.10)
- [HappyView v2.10.2 release](https://github.com/gamesgamesgamesgamesgames/happyview/releases/tag/v2.10.2)

Verified facts:

- Proposal 0016 was merged on 2026-07-03.
- `bluesky-social/atproto#5187` is still open and draft, with 74 commits and
  150 changed files, last updated 2026-07-03. Its branch contains
  `com.atproto.space.*`, `com.atproto.simplespace.*`, `packages/space`,
  LtHash code, PDS space endpoints, OAuth space-scope parsing, and tests.
- `@atproto/space` does not appear to be published on npm yet.
- Current registry versions checked: `@atproto/oauth-scopes` is `0.5.3`;
  `@atproto/pds` is `0.5.14`. This repo does not currently depend on either
  package directly.
- HappyView 2.10 aligns its spaces API with Proposal 0016 and splits endpoints
  into `com.atproto.space.*` protocol routes and `com.atproto.simplespace.*`
  management routes. Latest GitHub release checked is `v2.10.2` from
  2026-06-30; repo docs commits continue through 2026-07-05.
- The Arbiter forum thread has no new public posts after 2026-05-23. Lexicon
  Garden still exposes the same 16 `town.muni.arbiter.*` draft lexicons,
  including `resolveSpaceMembers`, `listSpaces`, `getSpaceConfig`,
  `getSpaceMembers`, `createDid`, and `updateDidDoc`.

2026-07-06 re-check:

- `bluesky-social/atproto` branch `permissioned-data` still exists at
  `3f6c96d5d2d25438bd40fa89d6ecc37865f8e354`, and PR #5187 is still draft/WIP.
- Direct branch inspection found the current implementation under
  `com.atproto.space.*` and `com.atproto.simplespace.*`; no
  `town.muni.arbiter.*` endpoint implementation is present in that branch.
- `com.atproto.space.listSpaces` lists spaces the authenticated user has
  written to, not "spaces I am a member of." The host-internal member-list
  surface is `com.atproto.simplespace.listMembers`, owner-only, and direct-DID
  only.
- HappyView's experimental surface remains app-specific
  `dev.happyview.space.*`, so it is useful as a spaces reference harness but
  not a shipped `town.muni.arbiter.*` server.

Ecosystem details that change CSN planning:

- Proposal 0016 says the protocol carries no member list. Space credential
  issuance is a policy decision above the protocol.
- A space type is a lexicon-resolved declaration with `"type": "space"` and is
  the OAuth consent label. CSN currently has space-type string constants in
  `packages/arbiter-client/src/space-ref.ts`, not lexicon declarations.
- `space:` OAuth scopes now distinguish `read` from `read_self`.
  `read` grants access to `getDelegationToken`; `read_self` only reads the
  user's own repo and cannot mint a credential for the whole space.
- The protocol writer set from `com.atproto.space.listRepos` is not the
  application membership list. It enumerates repos that have written at least
  one record into a space, not everyone allowed to read/write.
- `com.atproto.simplespace` is the required baseline PDS space-management
  implementation, but it is not the only possible implementation. CSN's
  Arbiter/group-directory layer should be framed as a higher-level
  space-management/authority policy, not as a protocol primitive.

## Code Reality

Repository state:

- Current branch is `main`, aligned with `origin/main`.
- Latest commit inspected: `2347fa0` (`Merge: V12 program handover prompt
(3.9B resolved)`).
- Relevant tags on `main`: `v12-phase-0`, `v12-phase-1`, `v12-phase-2`,
  `v12-review-fixes`, `v12-phase-3-task1`,
  `v12-phase-3-checkpoint2`, `v12-phase-3-checkpoint3`,
  `v12-phase-3-checkpoint4`, `v12-phase-3-checkpoint5`,
  `v12-phase-3-task-3.9b`.

Implemented and verified in code:

- `packages/spaces-consumer` exists and is flag-gated behind
  `SPACES_CONSUMER_ENABLED`.
- `SpacesConsumer` uses `GroupDirectoryPort.resolveSpaceMembers({consistency:
'strict'})`, fails closed on `partial`/`stale`/missing spaces, and does not
  count ordinary non-member drops as `memberCrossCheckFailures`.
- The public spaces-consumer sync/verification boundary is
  `PermissionedRepoPort`, not a package-root `CommitDigestVerifier`.
- `CsnDbGroupDirectoryPort` reports truncation as `partial: true` by fetching
  one extra row beyond `pageSize`.
- `CsnDbGroupMutationPort` has add/remove/suspend/reinstate/role operations and
  writes audit entries to `fact_log`.
- `MembershipService` emits `member.joined` and `member.departed`.
- Suspension and reinstatement are reachable through membership service/routes.
- Directory visibility is opt-in and member-settable.
- The Supertest owned-listener fix is present in
  `apps/api/tests/helpers/test-app.ts`,
  `apps/api/tests/helpers/test-http-servers.ts`, and
  `apps/api/tests/helpers/vitest.runtime.ts`.

Partially implemented or mismatched:

- `ARCHITECTURE-V12.md`, `CLAUDE.md`, and the handoff mention a
  `CommitDigestVerifier` port. No such public symbol exists in
  `packages/spaces-consumer/src/index.ts`; the current code intentionally folds
  verification into `PermissionedRepoPort`.
- Draft CSN space type declarations now exist, but they are not in the generated
  lexicon record-schema pipeline because the installed atproto lex tooling does
  not yet accept `"type": "space"`.
- The Phase 3 task plan still lists 3.9B as remaining. It is fixed and tagged.
- Task 3.7 is local-bootstrap complete and OAuth/BYO-DID incomplete.
  `AuthService.register()` enforces email addressee binding and atomic
  single-use consume inside the account transaction; the public
  `/api/v1/invitations/:token/accept` route now requires the addressed email and
  delegates to `AuthService.register()`. OAuth-based acceptance for an existing
  DID does not exist yet and should land with Phase 4 `space:` scope work.
- OAuth login exists, with sessions stored in `oauth_session`, and
  `MemberWriteProxy` can write member-owned public repo records through OAuth.
  There is no `space:` scope handling, delegation-token handling, space
  credential store, or OAuth-based invitation acceptance into a cooperative.
- `did_rotation_history` exists in schema and SQL, but no writer or reader is
  wired. The spaces consumer still compares DIDs by raw equality.
- `SPACES_CONSUMER_ENABLED=true` starts with `spaces: []`, an in-memory repo
  port, and log-only accepted-record handling.
- GovernanceView and CoopView packages do not exist.

Direct membership read inventory:

`rg` found direct `membership` / `membership_role` reads in 20
`apps/api/src` files. Hot spots by file:

|  Count | File                                                                                                                                                                               |
| -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|      5 | `apps/api/src/services/membership-service.ts`                                                                                                                                      |
|      4 | `apps/api/src/services/proposal-service.ts`                                                                                                                                        |
|      4 | `apps/api/src/services/network-service.ts`                                                                                                                                         |
|      4 | `apps/api/src/services/member-class-service.ts`                                                                                                                                    |
|      3 | `apps/api/src/scripting/script-service.ts`                                                                                                                                         |
|      3 | `apps/api/src/ai/tools/index.ts`                                                                                                                                                   |
|      2 | `apps/api/src/services/dashboard-service.ts`                                                                                                                                       |
|      2 | `apps/api/src/services/auth-service.ts`                                                                                                                                            |
|      2 | `apps/api/src/auth/middleware.ts`                                                                                                                                                  |
| 1 each | reporting, profile, operator-write-proxy, delegation-voting, federation route, explore route, auth route, permissions middleware, MCP server, proposal indexer, AI action executor |

Allowed direct membership access after Phase 3 should be limited to the
CSN-DB adapter/mutation packages and low-level tests/helpers. Application
services, middleware, XRPC handlers, MCP/tools/scripts, and routes should use
the read seam.

Still-live V9 retirement targets:

- `VisibilityRouter` and `private_record`
- `PrivateRecordService` and private-record routes/tests
- `GovernanceLabeler`
- `IFederationClient`, `HttpFederationClient`, RFC 9421 signing stack
- `cooperative_link`
- local PDS/PLC/blob classes used for dev/test and fallback

These should remain Phase 6 unless Phase 4/5 work touches them directly.

## Replanning Principles

1. Fix docs before more code where docs describe APIs that do not exist.
2. Treat Proposal 0016 as current direction, not final spec. Use it for
   interface shape and tests, but keep production code behind CSN ports.
3. Keep the Layer 2 boundary generic. Do not push display names, profiles,
   quorum, vote weight, or cooperative-specific eligibility into the Arbiter
   port.
4. Make the read seam a typed design slice before migration. A mechanical
   replacement risks either overloading `GroupDirectoryPort` or hiding app
   logic inside it.
5. Use mocks that preserve the real boundary behavior: async delivery, strict
   fail-closed partial/stale results, pagination/truncation, and realistic
   ordering/race behavior for invitation and HTTP tests.
6. Defer external XRPC Arbiter integration until there is a shipped server or
   a stable enough branch to target. Draft adapters are fine behind flags, but
   CSN-DB remains default.
7. Do not start Phase 6 retirement until Phase 3 read seam, Phase 4 space
   placement, and Phase 5 view extraction have stable landing points.

## Updated Execution Order

### Slice R0 - Reconcile Canonical Docs With Code And Proposal 0016

**Branch:** `feature/v12-phase-3-doc-reality-reconcile`

Deliverables:

- Update `ARCHITECTURE-V12.md` and `CLAUDE.md` so the digest boundary reflects
  actual code: `PermissionedRepoPort` is the package-root verify/sync boundary;
  an internal LtHash/commit verifier may be introduced later inside a real
  adapter.
- Update the Phase 3 plan progress banner: 3.9B is done; 3.7 is partial; 3.2
  has the active-filter bug fixed but the architectural read seam remains.
- Add a short note that Proposal 0016 now treats space types as lexicon
  `"type": "space"` declarations. The current CSN constants have draft
  declarations, but Phase 4 must still decide whether to publish the current
  `network.coopsource.org.spaceType.*` namespace or remap it before real
  `space:` OAuth scopes.
- Update dependency language: `@atproto/space` is not published; the
  implementation branch is a reference/spike target. This repo does not
  directly depend on `@atproto/oauth-scopes` or `@atproto/pds`.

Exit checks:

- `rg "CommitDigestVerifier" ARCHITECTURE-V12.md CLAUDE.md docs/archive/handoff-2026-07-05-v12-program.md docs/plans docs/superpowers/plans`
  returns only historical/reconciled notes.
- `pnpm --filter @coopsource/spaces-consumer test`

### Slice R1 - Design The Membership Read Seam

**Branch:** `feature/v12-phase-3-membership-read-seam-design`

Deliverables:

- Write a short design doc under `docs/superpowers/plans/` or
  `docs/plans/` that defines the read seam before code migration.
- Decide the API shape. Recommended:
  - Keep package-level `GroupDirectoryPort` generic: spaces, direct members,
    resolved DIDs/access, partial/stale metadata.
  - Add an API-layer membership read facade that composes the generic directory
    with local projections (`entity`, `member_class`, role definitions) for
    app needs.
  - Put permission resolution behind a single helper/facade so
    `didHasPermission`, `requireAuth`, and service reads use one source.
- Define canonical statuses:
  - active roster: `status='active' AND invalidated_at IS NULL`
  - suspended admin view: `status='suspended' AND invalidated_at IS NULL`
  - departed/invalidated rows are historical only
- Define pagination behavior and what happens if directory resolution is
  `partial` or `stale`. Security-sensitive reads fail closed; dashboard/report
  reads should surface a degraded result rather than silently miscounting.

Exit checks:

- Design reviewed against these call classes: auth/session, permissions,
  membership roster, network roster/counts, proposal quorum/vote weight,
  member classes, AI/tools/MCP/scripts, public explore/profile.
- Tests planned with async fake directory behavior and explicit
  partial/stale negative cases.

### Slice R2 - Migrate Security-Critical Reads

**Branch:** `feature/v12-phase-3-membership-read-seam-auth`

Scope:

- `apps/api/src/auth/middleware.ts`
- `apps/api/src/middleware/permissions.ts`
- `apps/api/src/services/auth-service.ts` session actor read
- federation approve/check paths that make caller-authority decisions

Requirements:

- Errors name the authorization axis where applicable.
- Fail closed on partial/stale directory resolution.
- Preserve existing owner/admin permission behavior via role definitions.
- Add tests proving a suspended, departed, invalidated, or partial-resolution
  member cannot pass authority checks.

Exit checks:

- Targeted API auth/permission tests.
- `rg` shows no direct membership reads in auth/permissions except inside the
  new facade or low-level adapter.

### Slice R3 - Migrate Rosters, Counts, And Network Reads

**Branch:** `feature/v12-phase-3-membership-read-seam-rosters`

**Implementation status, 2026-07-05:** R3 is partially landed on the current
feature branch. `MembershipService.listMembers/getMember` were removed, the
REST and XRPC member roster/get paths use `MembershipReadModel`, the shared
XRPC closed-governance gate and vote-eligibility callers use read-model member
lookups, federation profile member counts use `countActiveMembersResult`, and
`NetworkService`, public profile/explore/search display counts, dashboard
engagement counts, and annual-report member counts use projection helpers on
the same read model. Matchmaking display/user-context reads are also migrated.
R3 direct-read cleanup is complete except for any utility/tooling reads
intentionally deferred to R5.

Scope:

- `MembershipService.listMembers/getMember` (done)
- `NetworkService` network member counts/listing/join duplicate check (done)
- public profile/explore/search member counts (done)
- dashboard/reporting counts if covered by the same facade (done)
- matchmaking display counts and user context (done)

Requirements:

- Roster and counts agree for active, suspended, departed, and invalidated
  members.
- Role reads go through role-space helpers or the facade, not direct
  `membership_role` queries in services.
- Keep profile/display joins in the app layer; do not put display names in the
  generic Arbiter port.

Exit checks:

- Existing members/network tests green.
- New regression test: suspended member excluded from active roster and counts,
  visible only through explicit suspended/admin view.

### Slice R4 - Migrate Governance Reads

**Branch:** `feature/v12-phase-3-membership-read-seam-governance`

Scope:

- `ProposalService.castVote/resolveProposal` member class and quorum reads
  (done)
- `DelegationVotingService.calculateVoteWeight` (done)
- `MemberClassService` reads tied to active members/classes (done)
- `proposal-indexer` vote-weight projection (done)
- XRPC vote eligibility paths that currently depend on membership service
  (done in earlier R3/XRPC slice)

Requirements:

- No cooperative-specific vote/quorum rules move into Layer 2. This slice may
  expose plain membership/class facts, but the application logic stays in
  services until Phase 5 extracts GovernanceView/CoopView.
- Add tests for suspended/departed members in voting, quorum, and class quorum.

Exit checks:

- `pnpm --filter @coopsource/api test -- proposals xrpc-vote-eligibility member-class delegation-voting`
  or equivalent narrowed Vitest runs.

### Slice R5 - Migrate Remaining Utility Reads And Close Task 3.2

**Branch:** `feature/v12-phase-3-membership-read-seam-utilities`

Scope:

- AI tools and trigger action executor (done)
- MCP server (done)
- scripting service (done)
- proposal indexer (done in R4)
- reporting/dashboard/profile/operator-write-proxy leftovers (done)
- route-level direct reads not already covered (no live direct reads remain;
  remaining grep hits are admin reset SQL table names and object-property
  formatting of service-returned membership rows)

Exit checks:

- `rg "selectFrom\\('membership'\\)|selectFrom\\('membership_role'\\)|selectFrom\\(\"membership\"\\)|selectFrom\\(\"membership_role\"\\)" apps/api/src`
  returns no app-level direct readers except `MembershipReadModel` and
  explicitly documented low-level/admin reset exceptions.
- `pnpm --filter @coopsource/api test`

### Slice R6 - Finish Invitation Hardening Or Move It Explicitly To Phase 4

**Branch:** `feature/v12-phase-3-invitation-redemption-complete`

Status:

- Local bootstrap hardening is done in this branch. Public token accept requires
  `email`, validates the pending token/expiry for stable API errors, then uses
  `AuthService.register()` for DID/entity/profile/credential/membership writes.
- Public token lookup no longer exposes the full invitee address; it returns
  `email: null` plus a masked `emailHint`, so the accept-time email value is not
  learnable from the token alone.
- `AuthService.register()` consumes the invitation with a conditional
  `pending -> accepted` update inside the same DB transaction as the account
  credential insert. Accepted invitations remain historical rows
  (`status='accepted'`, `invalidated_at IS NULL`), not revoked/deleted rows.
- Regression coverage now includes wrong-email public accept, sequential
  single-use accept, and concurrent redemption where exactly one account and one
  active membership are created.
- OAuth BYO-DID accept does not exist. Keep it in Phase 4 with `space:` scope,
  delegation-token, and existing-DID proof design.

Remaining plan:

- For DID-bound invites, require an authenticated session/OAuth session for
  `invitee_did`.
- Decide whether that flow reuses `AuthService.register()` pieces or deserves a
  small `InvitationRedemptionService` once the OAuth credential seam exists.

### Slice R7 - DID Rotation Equality Gate

**Branch:** `feature/v12-phase-3-did-rotation-gate`

**Implementation status, 2026-07-05:** the spaces consumer accept path now uses
a `DidEquivalencePort` instead of raw DID equality. The default port preserves
raw equality, and the CSN dispatch path wires `KyselyDidEquivalencePort`, which
resolves both record author DIDs and resolved member DIDs through
`did_rotation_history` before comparing them. Tests cover rotated old-to-current
author acceptance, lookup failure fail-closed behavior, chain resolution through
the DB table, and corrupt cycle rejection. This is still only as strong as the
table contents: PLC monitoring/writer plumbing remains a Phase 4/6 dependency.

Do not spend this slice pretending the empty `did_rotation_history` table gives
real protection. Instead:

- Add a small `DidEquivalencePort` / helper with tests over
  `did_rotation_history`.
- Wire it into `SpacesConsumer.handleRecord` before enabling the consumer.
- Record the missing writer as a Phase 4/6 dependency: PLC monitoring must
  populate the table before global DID equality can be trusted.
- Audit security-critical direct DID comparisons and schedule replacements by
  risk. Do not block the read seam on replacing every equality check in the
  app in one pass.

### Slice R8 - XRPC Group Directory Adapter Spike

**Branch:** `feature/v12-phase-3-xrpc-arbiter-spike`

Gate:

- Re-check the watchlist immediately before starting. As of 2026-07-06, no
  shipped Arbiter server was found, and the current atproto implementation
  branch exposes `com.atproto.space.*`/`com.atproto.simplespace.*`, not
  `town.muni.arbiter.*`.

Recommended scope:

- Keep CSN-DB as default.
- Implement only a mock-server-tested adapter for the current draft substrate
  shape: `com.atproto.space.listSpaces`, `com.atproto.space.getSpace`, and
  `com.atproto.simplespace.listMembers`.
- Do not pretend the current draft has a recursive protocol-level
  `resolveSpaceMembers` primitive. The adapter may implement CSN's
  `resolveSpaceMembers` by returning the direct DID set from
  `simplespace.listMembers`, preserving `partial`/`stale` semantics.
- Do not wire a live integration test or runtime env switch until a real server
  exists and the auth/credential posture is settled.

Implementation status, 2026-07-06:

- `packages/arbiter-client/src/xrpc-group-directory-port.ts` now exports
  `XrpcGroupDirectoryPort` plus explicit `SpaceRef` <-> current draft
  `at://{authorityDid}/space/{spaceType}/{skey}` helpers.
- Tests cover request shape, config mapping, strict pagination,
  `projection-ok` partial handling, and fail-closed upstream errors.
- Production wiring is intentionally deferred; `CsnDbGroupDirectoryPort`
  remains the default.

## Phase 4 Reframing

Phase 4 should not start as "write proposals/votes to spaces" immediately. It
needs a short substrate alignment slice first:

1. Define or remap CSN space type lexicon declarations.
   - Current constants: `network.coopsource.org.spaceType.members`,
     `network.coopsource.org.spaceType.role`,
     `network.coopsource.org.spaceType.memberClass`.
   - Proposal 0016 expects lexicon space declarations with user-legible names
     and collections. Recommended: create draft CSN space declarations under a
     namespace that can be published and requested via `space:` scopes, rather
     than relying on private constants.
2. Extend OAuth planning from `rpc:` scopes to `space:` scopes.
   - `read` is required for AppView sync because it enables
     `getDelegationToken`.
   - `read_self` is useful for member export/personal-only flows but cannot
     sync a cooperative space.
3. Decide background sync credential posture.
   - Proposal 0016 lets an app serving several users obtain a space credential
     using any one user's session, but when all OAuth sessions are gone the app
     cannot renew.
   - CSN needs a concrete answer for always-on AppView projection: active
     member session pool, managing-app policy, service identity, or a
     CSN-controlled authority credential flow.
4. Spike against either HappyView 2.10 or the `atproto#5187` branch.
   - Goal: prove notification -> listRepos/listRepoOps/getRepo -> LtHash
     verification -> member cross-check -> Postgres projection.
   - Keep it as a harness/reference; do not migrate CSN's AppView substrate by
     default.

Initial Phase 4 substrate artifact started in this branch:

- Draft Proposal 0016 space type declarations now exist under
  `packages/lexicons/network/coopsource/org/spaceType/` for the existing CSN
  members, role, and member-class space type NSIDs.
- `@coopsource/lexicons` exports `CSN_SPACE_TYPE_DECLARATIONS` and the three
  NSID constants from `src/space-types.ts`. They intentionally stay outside the
  generated record-schema pipeline because the installed `@atproto/lex-cli`
  rejects `"type": "space"` until upstream tooling catches up.
- `@coopsource/lexicons` also exports inert `space:` OAuth scope formatters
  (`formatSpaceScope`, `formatSpaceReadScope`, `formatSpaceReadSelfScope`) with
  tests for encoded authority DIDs, `read` versus `read_self`, collection
  narrowing, and manage scopes. They are not wired into live auth flows yet.
- `@coopsource/lexicons` now exports `CSN_SPACE_PLACEMENT_MATRIX`, derived from
  those declarations, plus helpers for collection-narrowed AppView `read` and
  member-self `read_self` scopes. The companion planning doc is
  `docs/plans/2026-07-06-v12-phase-4-space-placement-matrix.md`.
- `@coopsource/lexicons` now exports
  `formatCsnAppViewReadScopePlan()` and
  `formatCsnMemberSelfReadScopePlan()`, turning that placement matrix into
  draft `space:` OAuth scope strings for either the full CSN matrix or an
  explicit collection subset. Unknown collection names fail fast so OAuth
  planning cannot silently under-scope a caller.
- `@coopsource/spaces-consumer` now exports `SpaceCredentialManager`, a
  non-live coordinator over `SpaceCredentialStore` and a future issuer port. It
  models missing credentials, refresh-per-batch, near-expiry refresh, and
  member-list-change invalidation without choosing a real upstream issuer yet.
- `@coopsource/spaces-consumer` now exports
  `TwoStepSpaceCredentialIssuer`, an executable draft issuer seam that sequences
  member-grant issuance before space-credential exchange, derives cache expiry
  from response metadata or JWT `exp`, and leaves unstable XRPC transport behind
  narrow client ports.
- `@coopsource/spaces-consumer` now exports
  `CredentialedPermissionedRepoPort`, a local harness wrapper that obtains a
  space credential before each sync batch. The first harness test runs
  `network.coopsource.governance.vote` through credential issuance, repo sync,
  strict membership cross-check, handler acceptance, and checkpoint commit.
- `@coopsource/spaces-consumer` now exports `PermissionedRecordWritePort`,
  `InMemoryPermissionedRecordWritePort`, and structured write-location URI
  formatting. The API uses this as the write-side seam for closed governance
  records instead of letting `VisibilityRouter` directly create
  `private_record` rows.
- `ProposalService.castVote()` now asks `VisibilityRouter` before writing the
  `network.coopsource.governance.vote` record. Closed-governance cooperatives
  route votes to Tier 2 private storage under the cooperative DID; open and
  mixed-default cooperatives keep the existing member-owned PDS write path.
- `ProposalService.createProposal()` and `castVote()` now perform Tier 2 writes
  through `PermissionedRecordWritePort`. The default adapter is
  `PrivateRecordPermissionedWritePort`, so physical storage is still
  `private_record`, but persisted proposal/vote URIs use the structured
  permissioned-space URI helper rather than public-looking `at://did/collection`
  locations.
- `VisibilityRouter` is now a placement decision helper. It returns Tier 1 or a
  concrete `SpaceRef` for Tier 2; it no longer has storage side effects.
- Closed/private permissioned-space proposals do not emit public governance
  labels during resolution. Public anchors for private governance are forbidden
  by default until an explicit optional anchor record is designed.
- The optional public-anchor design now exists at
  `docs/plans/2026-07-06-v12-phase-4-private-governance-anchor-design.md`.
  It keeps anchors disabled by default, forbids labels on permissioned proposal
  URIs, and defines a minimal `proposalAnchor` record shape that excludes
  private proposal payloads, author DIDs, voter DIDs, private URIs, and tally
  details.
- Keep `network.coopsource.org.spaceType.*` as the canonical CSN draft space
  type namespace for this PoC. Rename only if upstream final syntax or tooling
  makes the current namespace actively misleading.
- Next Phase 4 implementation should add the inert optional proposal-anchor
  lexicon/service seam for closed/private governance, then replace the legacy
  writer adapter with a real permissioned-space writer when the upstream write
  API is stable enough to target.

## Phase 5 Parallelization

Phase 5 is still the largest CSN-owned gap and can begin in parallel after R1
defines the read facts available to governance.

Recommended first Phase 5 slice:

- Create a design doc for `packages/governance-view` and
  `packages/coop-view`. (Started at
  `docs/plans/2026-07-06-v12-phase-5-governance-view-interface-design.md`.)
- Define the ten `GovernancePluginSet` interfaces as plain-value async inputs.
  (Reviewed against current proposal/vote/delegation code; generic
  `packages/governance-view` interface/default extraction has started.)
- Map existing services to plugin candidates:
  - member classes -> `voteWeight`
  - proposal service checks -> `eligibility`, `quorum`, `actionAuthorizer`
  - delegation voting -> `delegateChains`
  - patronage/capital accounts -> patronage/distribution plugins
  - meeting records -> `meetingMinutes`
- Do not extract code until the interface doc is reviewed against current
  proposal/vote/delegation tests. Status: satisfied for the generic defaults
  package only; `packages/coop-view` adapters and service rewrites still need
  their own review gate.

This can run beside late Phase 3 slices because it should initially be
interface/design work, not a broad service rewrite.

## Phase 7 Audit Parallelization

The read-only UX audit can start any time. Implementation should still wait
until Phases 3 and 4 settle, but a separate agent/thread can inventory:

- onboarding/join flow dead ends
- cooperative vs network context confusion
- proposals/voting flow gaps
- membership admin and invitation states
- agreements/signatures
- finance/patronage
- empty/loading/error states

No screenshot-driven redesign implementation should start until the architecture
surface stops moving.

## Phase 8 Architecture And Implementation Review

Add a dedicated review phase for a senior engineering assessment of the project
after the current substrate work has stabilized. This should be separate from the
Phase 7 UI/UX audit, although both reviews should cross-reference each other.

Recommended timing:

- Start after Phase 3 membership read seam and Phase 4 space-placement substrate
  have landed, or earlier as a read-only review if implementation velocity slows.
- Do not block urgent correctness/security fixes on this phase.
- Treat the output as a ranked findings document, not an automatic refactor
  mandate.

Scope:

- Architecture fit: whether the current V12 layering still matches the product
  and atproto substrate reality.
- Boundary quality: ports, package seams, service ownership, container wiring,
  and places where abstractions are either too thin, too broad, or misplaced.
- Data model and projection model: which tables are canonical, which are caches,
  and where that distinction is unclear in code.
- Operational posture: test strategy, failure modes, observability, local/dev
  ergonomics, CI assumptions, package manager/runtime assumptions, and migration
  discipline.
- Product implementation fit: whether current APIs, services, and frontend flows
  make future governance/spaces work easier or harder.

Deliverables:

- A review doc under `docs/plans/` with findings ordered by severity/risk.
- A short recommendation matrix: keep, simplify, defer, redesign, or remove.
- A proposed follow-up slice list only for changes with clear risk reduction or
  momentum gain.
- A cross-reference to the Phase 7 UI/UX audit so architectural fixes and UX
  fixes do not work against each other.

## Verification Gates

Per-slice:

- Run targeted package tests first.
- For API slices, run `pnpm --filter @coopsource/api test` before merge.
- For structural/federation changes, run
  `pnpm --filter @coopsource/federation build` before full build.

Phase completion:

- `pnpm build`
- `pnpm test`
- Docker-backed `make test:all` when Docker is available.
- No-ff merge to `main`, then tag (`v12-phase-3` when the whole phase is
  complete; task/checkpoint tags are fine before then).

## Batched Feedback For User

These do not block R0/R1, but they should be answered before Phase 4:

1. **Digest boundary:** should we update docs to match current code
   (`PermissionedRepoPort` owns verification), or reintroduce an explicit
   `CommitDigestVerifier` port? Recommendation: update docs; keep any LtHash
   verifier internal to a real `PermissionedRepoPort` adapter.
2. **Invitation UX:** local bootstrap accepts now require addressed email and
   flow through `AuthService.register()`. Remaining question: what exact
   OAuth/BYO-DID accept surface should Phase 4 expose once `space:` scopes are
   available?
3. **Space type namespace:** draft space type lexicons now exist under the
   current `network.coopsource.org.spaceType.*` NSIDs. Remaining question:
   should these be renamed before external publication, or is the current
   namespace acceptable because consent screens show the declaration `name`?
4. **Background sync credential model:** is CSN allowed to rely on at least one
   active member OAuth session per cooperative space to renew credentials?
   Recommendation: do not rely on that long term; spike `managing-app` or
   service-identity based authority behavior as part of Phase 4.
5. **Parallel work:** should a separate worker begin Phase 5 interface design
   or the Phase 7 read-only UX audit while Phase 3 read-seam migration proceeds?
   Recommendation: Phase 5 interface design can start after R1; Phase 7 audit
   can start now if capacity exists.
