# V12 Membership Read-Seam Design

**Date:** 2026-07-05
**Status:** Active design for Slice R1. This document refines Task 3.2 in
`docs/superpowers/plans/2026-07-04-v12-phase-3-arbiter-convergence.md` and
the execution order in
`docs/plans/2026-07-05-v12-replan-after-code-deep-dive.md`.

**Implementation update, 2026-07-05:** R2 security reads are implemented in
`MembershipReadModel` for auth/session actor resolution, permission checks,
federation caller authority, and `OperatorWriteProxy` operational role gates.
The R3 roster/count and public display slices are also implemented:
`/api/v1/me/memberships`, `/api/v1/members`,
`network.coopsource.org.listMembers`, `network.coopsource.org.getMembership`,
the shared XRPC closed-governance gate, XRPC vote eligibility callers, Inlay
membership status, federation profile member counts, `NetworkService`, public
profile/explore/search display counts, dashboard engagement counts, and annual
report member counts, and matchmaking display/user-context reads now use
read-model helpers. Security-sensitive paths preserve
`partial`/`stale`/`unavailable` spaces failures; public/dashboard/matchmaking
display counts use explicit projection helpers. Remaining migrations are deeper
governance math and utility/tooling reads.

## Goal

Finish the membership authority seam without polluting Layer 2. Writes already
flow through `GroupMutationPort`; reads still query `membership` and
`membership_role` directly across the API. The next implementation slices
should route those reads through one API-layer read model that composes:

- `GroupDirectoryPort` for the authority answer: who is in a space, with
  `ok`/`partial`/`stale` metadata.
- CSN projection tables for local display data: membership IDs, display names,
  handles, profile fields, role rows, member classes, and counts.
- Existing application rules for permissions, governance weights, quorum, and
  visibility.

Do not add profile, quorum, vote weight, or cooperative-specific eligibility
methods to `packages/spaces-consumer/src/group-directory-port.ts`.

## Current Boundaries

`GroupDirectoryPort` is intentionally generic:

- `listSpaces`
- `getSpaceConfig`
- `getDirectSpaceMembers`
- `resolveSpaceMembers`

`CsnDbGroupDirectoryPort` currently resolves the CSN `members`, `roles/*`, and
`classes/*` spaces from `membership`/`membership_role`, applies
`status='active' AND invalidated_at IS NULL`, and marks truncated rosters
`partial:true`. That is the correct Layer 2 adapter behavior.

Application callers need richer data than Layer 2 should know about. Examples:

- `requireAuth` needs an actor membership ID, display name, cooperative DID,
  and roles.
- Federation caller-authority checks need active roles plus `role_definition`
  inheritance.
- `MembershipService.listMembers` needs pagination, display names, visibility,
  and role lists.
- `ProposalService` needs vote weights, class maps, member counts, and class
  denominator weights.
- Explore/search/network pages need counts and profile projections.

## Proposed API-Layer Read Model

Add an API-owned service, tentatively:

`apps/api/src/services/membership-read-model.ts`

The implementation may query `membership` and `membership_role` directly. That
is the point of the seam: direct table access becomes localized here and in
low-level adapters/tests, rather than spread through application services.

The container must also expose the two read-side objects explicitly:

- `groupDirectory: GroupDirectoryPort`, backed by `CsnDbGroupDirectoryPort`
  today.
- `membershipReadModel: MembershipReadModel`, injected into auth/permission
  middleware instead of giving those modules membership-table DB globals.

Recommended public methods:

```typescript
export interface ActiveMembershipProjection {
  readonly membershipId: string;
  readonly cooperativeDid: string;
  readonly memberDid: string;
  readonly status: 'active';
  readonly roles: readonly string[];
  readonly joinedAt: Date | null;
}

export interface ActorMembershipProjection extends ActiveMembershipProjection {
  readonly displayName: string;
}

export interface MemberDirectoryEntry extends ActiveMembershipProjection {
  readonly displayName: string;
  readonly handle: string | null;
  readonly description?: string | null;
  readonly directoryVisible?: boolean;
}

export interface MembershipReadModel {
  getPrimaryActorMembership(
    memberDid: DID,
  ): Promise<ActorMembershipProjection | null>;
  getActiveMembership(
    cooperativeDid: DID,
    memberDid: DID,
  ): Promise<ActiveMembershipProjection | null>;
  hasPermission(
    cooperativeDid: DID,
    memberDid: DID,
    permission: Permission,
  ): Promise<boolean>;
  listMembersResult(
    cooperativeDid: DID,
    params: PageParams,
    options?: ListMembersOptions,
  ): Promise<MemberDirectoryResult>;
  getMemberResult(
    cooperativeDid: DID,
    memberDid: DID,
  ): Promise<MemberLookupResult>;
  countActiveMembersResult(
    cooperativeDid: DID,
  ): Promise<ActiveMemberCountResult>;
  listMemberCooperatives(
    memberDid: DID,
  ): Promise<readonly MemberCooperativeSummary[]>;
  getVoteWeight(cooperativeDid: DID, memberDid: DID): Promise<number>;
  getClassMap(
    cooperativeDid: DID,
    memberDids: readonly DID[],
  ): Promise<ReadonlyMap<DID, string | null>>;
  getClassWeightDenominator(
    cooperativeDid: DID,
    className: string,
  ): Promise<number>;
}
```

This is a design target, not a requirement to land every method in one commit.
The first implementation slice should add the service with the security-critical
methods only, then expand it as callers migrate.

## Consistency Rules

Authority checks must use `GroupDirectoryPort.resolveSpaceMembers` with
`consistency: 'strict'` before trusting a membership projection as authority:

- If resolution is `!ok`, `partial`, or `stale`, fail closed.
- If the DID is absent from the resolved members, return not-member.
- If the DID is present, the projection query may provide roles, IDs, and
  display fields.

One exception is candidate discovery for the current session model:
`requireAuth` currently chooses the user's first active cooperative membership
because the request does not carry a workspace/coop selector. The read model may
query the projection first to discover that candidate cooperative, but it must
strict-check the discovered `(cooperativeDid, memberDid)` pair before returning
an actor.

Projection/display reads may use `consistency: 'projection-ok'` and the local
tables, because they are not granting authority. Examples: public explore
counts, dashboards, and reports. When a caller uses a count to authorize an
action or determine quorum, use the governance methods and document whether the
denominator is projection-based or strict.

For current CSN-DB default, strict resolution is still local and cheap. For a
future XRPC Arbiter adapter, strict resolution may become async, partial, or
unavailable; the read model must preserve that timing/failure behavior in
tests.

CSN-DB strict reads should load a complete authoritative roster rather than
returning a capped partial result. `projection-ok` reads may remain page-capped
and should surface `partial:true` when truncated.

## Error And Result Semantics

Use axis-specific errors only where a request is denied:

- Missing session/entity: existing auth `UNAUTHORIZED` behavior.
- No active membership: `UNAUTHORIZED` or `FORBIDDEN`, depending on route,
  with `axis: 'spaces'` where the response already uses axis fields.
- Partial/stale/unavailable directory during authority check: fail closed with
  `axis: 'spaces'` and a reason naming `partial`, `stale`, or `unavailable`.

Do not silently fall back to direct projection reads after strict directory
resolution fails. That would recreate the bypass the seam is meant to remove.

## Direct Read Inventory

`rg` found direct membership reads in these API files:

| Category                                       | Files                                                                                                                                                                                                                                                                                                                                                          | Migration target                                                                                                                            |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Security-critical request identity/permissions | `apps/api/src/auth/middleware.ts`, `apps/api/src/middleware/permissions.ts`, `apps/api/src/services/operator-write-proxy.ts`, `apps/api/src/routes/federation.ts`, `apps/api/src/routes/auth.ts`, `apps/api/src/services/auth-service.ts`                                                                                                                      | Migrate first. Use strict directory resolution and fail closed.                                                                             |
| Roster/profile/count surfaces                  | `apps/api/src/services/membership-service.ts`, `apps/api/src/services/network-service.ts`, `apps/api/src/services/profile-service.ts`, `apps/api/src/routes/explore.ts`, `apps/api/src/services/search-service.ts`, `apps/api/src/services/dashboard-service.ts`, `apps/api/src/services/reporting-service.ts`, `apps/api/src/services/matchmaking-service.ts` | Use read model roster/count methods. Projection-ok is acceptable for display-only counts.                                                   |
| Governance and class math                      | `apps/api/src/services/proposal-service.ts`, `apps/api/src/services/delegation-voting-service.ts`, `apps/api/src/services/member-class-service.ts`, `apps/api/src/appview/indexers/proposal-indexer.ts`                                                                                                                                                        | Use read model governance helpers until Phase 5 extracts `GovernanceView`. Preserve current vote/quorum behavior unless tests expose a bug. |
| Utility/tooling/indexing                       | `apps/api/src/ai/tools/index.ts`, `apps/api/src/ai/triggers/action-executor.ts`, `apps/api/src/mcp/server.ts`, `apps/api/src/scripting/script-service.ts`                                                                                                                                                                                                      | Migrate last. These should not make independent authority decisions.                                                                        |

Allowed direct membership access after Phase 3:

- `packages/arbiter-client` CSN-DB adapters.
- `GroupMutationPort` implementations.
- `apps/api/src/services/membership-read-model.ts` and focused tests/helpers.
- AppView indexers only when mutating projections from incoming records, not
  when answering application authority questions.

## Implementation Slices

### R2 Security Reads

- Add `MembershipReadModel` with `getPrimaryActorMembership`,
  `getActiveMembership`, and `hasPermission`.
- Add `groupDirectory` and `membershipReadModel` to the production and test
  containers.
- Replace `auth/middleware.ts` membership-table lookups with the read model,
  preserving existing `req.actor` shape and current account-not-found vs
  no-active-membership responses.
- Route federation caller-authority checks through the read model.
- Route federation authority checks and auth session membership summaries through
  the read model.
- `OperatorWriteProxy` should use the same strict membership read seam for its
  role gate, while preserving the current hardcoded operational role list
  (`admin`, `board-member`, `staff`). Do not silently map it to a new
  `Permission` without deciding the intended capability.
- Tests: active member succeeds; inactive/suspended/invalidated member fails;
  partial/stale directory fails closed; role inheritance and `'*'` wildcard are
  unchanged.

### R3 Roster And Counts

- Done: moved `MembershipService.listMembers` and `getMember` reads out of
  `MembershipService`; `/api/v1/members`, org XRPC member list/get, and the
  closed-governance gate now use `MembershipReadModel`.
- Done: added `listMembersResult`, `getMemberResult`,
  `countActiveMembersResult`, `listMemberCooperativesResult`, and paginated
  roster helpers. Active roster/count reads strict-check spaces authority;
  explicit non-active admin roster reads (for example `status=suspended`) stay
  local projections.
- Done: migrated `NetworkService`, public profile/explore/search display
  counts, dashboard engagement counts, annual-report member counts, and
  matchmaking display/user-context reads.
- Preserve cursor semantics where existing endpoints expose cursors.

### R4 Governance Reads

- Done: added governance helper methods for vote weight, voter class maps,
  active class counts, and class denominator weights.
- Done: migrated `ProposalService`, `DelegationVotingService`,
  `MemberClassService`, and `proposal-indexer`.
- Do not move quorum or vote-weight policy into `GroupDirectoryPort`; keep it
  in the API read model now and in `GovernanceView` later.

### R5 Utility Reads

- Done: migrated AI tools, action executor notification fanout, MCP server,
  scripting service scoped record reads, and the membership write-path pending
  projection lookup.
- Tests can be narrower here, but mocks must preserve async ordering and
  partial/stale failure behavior when the helper authorizes access.

## Test Double Requirements

Mocks for this seam must preserve more than row shapes:

- `GroupDirectoryPort` doubles need async behavior and must be able to return
  `ok:false`, `partial:true`, `stale:true`, missing spaces, and delayed
  responses.
- Permission tests should verify that partial/stale resolution fails closed
  before any projection-only fallback is consulted.
- Pagination tests should keep current cursor ordering stable.
- Concurrency tests are required only where migration touches invitation or
  membership mutation flows; read-only migration should not invent new timing
  contracts.

## Open Decisions To Batch For User Feedback

1. `getPrimaryActorMembership` preserves the current "first active membership"
   session behavior. A later UX/account slice should decide how multi-coop
   actors choose an active workspace.
2. Governance denominators can remain projection-based in Phase 3 because CSN-DB
   is the default authority adapter. Before enabling a remote XRPC Arbiter
   adapter for governance writes, strict denominator behavior needs a second
   pass.
3. `AppView` indexers may keep direct projection writes, but any read used to
   accept/reject an incoming record should go through the read model or the
   spaces consumer authority path.
