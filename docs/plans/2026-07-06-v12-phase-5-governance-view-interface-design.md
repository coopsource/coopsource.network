# V12 Phase 5 GovernanceView / CoopView Interface Design

**Date:** 2026-07-06
**Status:** Interface slice reviewed against current proposal/vote/delegation
code and started. `packages/governance-view` now exists with generic value
types, the ten plugin interfaces, default no-op/one-member-one-vote behavior,
and tests. `packages/coop-view` now exists with CSN-specific vote-weight and
eligibility adapters over narrow membership reader ports; `apps/api` composes a
`GovernancePluginSet` from `MembershipReadModelVoteWeightReader` and
`MembershipReadModelVotingEligibilityReader`, and `ProposalService.castVote`
now gets vote weight through that plugin set; the shared XRPC/Inlay vote
eligibility path gets active-member gating through the same plugin set; and
`ProposalService.resolveProposal` now evaluates headcount/class quorum through
`GovernancePluginSet.quorum`. Outgoing delegate-chain resolution is composed
through `GovernancePluginSet.delegateChains`. Cast-vote weight snapshots now
use a CoopView delegated vote-weight reader backed by base membership weights
and active delegation rows, so stored vote weights match
delegation-inclusive eligibility/display weights without keeping the expansion
rule in `DelegationVotingService`. Proposal-scoped delegations now override
project-level delegations for the same proposal during weight expansion.
`requirePermission` now authorizes through
`GovernancePluginSet.actionAuthorizer`, backed by active membership roles and
the existing role-permission resolver; proposal update/delete author checks now
also call the same plugin with a small proposal context payload. Do not move
additional service logic until the adapter layer is tested against current API
suites.

## Purpose

Phase 5 extracts the governance layer without pushing cooperative policy into
the Arbiter or permissioned-space substrate. GovernanceView owns generic
governance mechanics. CoopView supplies CSN-specific plugins for cooperative
law, member classes, patronage, meetings, agreements, and fiscal context.

The key rule from `ARCHITECTURE-V12.md` still holds: plugin inputs are plain
values, all plugin calls are async, defaults are no-ops, and the call graph is
one-way. GovernanceView may call plugins; plugins must not reach back into a
GovernanceView service handle.

## Package Boundary

`packages/governance-view` should contain:

- Generic value types for proposals, votes, tallies, snapshots, delegation
  chains, and anchor summaries.
- `GovernancePluginSet` plus defaults.
- Generic reducers/indexers that can evaluate proposal state from records and
  plugin results.
- No CSN database dependency and no `network.coopsource.*` service imports.

`packages/coop-view` should contain:

- CSN implementations of the plugin interfaces.
- Adapters over existing API services/read models while code is being
  extracted.
- Cooperative-specific records and projection helpers.
- No direct changes to the permissioned-space substrate.

`apps/api` should initially wire the two packages together and continue to own
HTTP/XRPC transport, auth/session handling, and existing storage.

## Shared Values

The first package should define these as plain JSON-compatible values:

- `GovernanceActorRef`: `{ did }`
- `GovernanceGroupRef`: `{ authorityDid, spaceKey, spaceType? }`
- `GovernanceProposalRef`: `{ uri, cid?, collection }`
- `GovernanceVoteRef`: `{ uri, cid?, collection }`
- `GovernancePeriodRef`: `{ id, startsAt?, endsAt? }`
- `GovernanceDecisionContext`: proposal ref, cooperative/group ref, action,
  actor, timestamp, optional record payload
- `GovernanceTallyInput`: proposal, votes, eligible-voter denominator, class
  denominators, optional delegation expansion

These values deliberately avoid Kysely rows and Express request/session objects.

## Plugin Set

```ts
interface GovernancePluginSet {
  voteWeight: VoteWeightPlugin;
  eligibility: EligibilityPlugin;
  quorum: QuorumPlugin;
  actionAuthorizer: ActionAuthorizerPlugin;
  anchorSummary: AnchorSummaryPlugin;
  historicalState: HistoricalStatePlugin;
  patronageAllocator: PatronageAllocatorPlugin;
  surplusDistributor: SurplusDistributorPlugin;
  meetingMinutes: MeetingMinutesPlugin;
  delegateChains: DelegateChainsPlugin;
}
```

Default behavior:

- `voteWeight`: returns weight `1`.
- `eligibility`: returns eligible `true`.
- `quorum`: evaluates simple headcount/votes-cast rules only.
- `actionAuthorizer`: allows generic governance actions when Axis 1/2 checks
  have already passed.
- `anchorSummary`: returns a non-identifying summary or `null`.
- `historicalState`: in-memory/no-op snapshot read and write.
- `patronageAllocator`: returns no allocations.
- `surplusDistributor`: returns no distributions.
- `meetingMinutes`: returns no canonicalized minutes.
- `delegateChains`: returns the direct voter with no expansion.

## Proposed Interface Shapes

```ts
interface VoteWeightPlugin {
  weightForVote(input: {
    voter: GovernanceActorRef;
    proposal: GovernanceProposalRef;
    cooperative: GovernanceGroupRef;
    voteChoice: string;
    at: string;
  }): Promise<{ weight: number; evidence?: unknown }>;
}

interface EligibilityPlugin {
  canVote(input: {
    voter: GovernanceActorRef;
    proposal: GovernanceProposalRef;
    cooperative: GovernanceGroupRef;
    at: string;
  }): Promise<{ eligible: boolean; reason?: string; evidence?: unknown }>;
}

interface QuorumPlugin {
  evaluate(input: GovernanceTallyInput): Promise<{
    met: boolean;
    outcomeReason?: 'met' | 'no_quorum' | 'class_quorum_not_met';
    evidence?: unknown;
  }>;
}

interface ActionAuthorizerPlugin {
  authorize(input: GovernanceDecisionContext): Promise<{
    authorized: boolean;
    reason?: string;
  }>;
}

interface AnchorSummaryPlugin {
  summarize(input: GovernanceDecisionContext): Promise<{
    publicSummary: unknown | null;
  }>;
}

interface HistoricalStatePlugin {
  readSnapshot(input: {
    cooperative: GovernanceGroupRef;
    at: string;
  }): Promise<{ snapshotId?: string; members?: unknown }>;
  recordSnapshot(input: {
    cooperative: GovernanceGroupRef;
    at: string;
    members: unknown;
  }): Promise<{ snapshotId: string }>;
}

interface PatronageAllocatorPlugin {
  allocate(input: {
    cooperative: GovernanceGroupRef;
    period: GovernancePeriodRef;
    surplus: number;
    metrics: ReadonlyArray<unknown>;
  }): Promise<{ allocations: ReadonlyArray<unknown> }>;
}

interface SurplusDistributorPlugin {
  distribute(input: {
    cooperative: GovernanceGroupRef;
    period: GovernancePeriodRef;
    allocations: ReadonlyArray<unknown>;
  }): Promise<{ distributions: ReadonlyArray<unknown> }>;
}

interface MeetingMinutesPlugin {
  canonicalize(input: {
    cooperative: GovernanceGroupRef;
    sourceRecords: ReadonlyArray<unknown>;
  }): Promise<{ minutes: unknown | null }>;
}

interface DelegateChainsPlugin {
  resolve(input: {
    voter: GovernanceActorRef;
    proposal: GovernanceProposalRef;
    cooperative: GovernanceGroupRef;
    at: string;
  }): Promise<{
    chain: ReadonlyArray<GovernanceActorRef>;
    terminal: GovernanceActorRef;
  }>;
}
```

The first implementation should keep `unknown` evidence payloads where the
shape is CSN-specific. Narrow them inside `packages/coop-view` once extraction
starts.

## Current Code Mapping

| Plugin               | Current source candidates                                                                                              | Notes                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `voteWeight`         | `ProposalService.castVote`, `DelegationVotingService.calculateVoteWeight`, `MemberClassService`, `MembershipReadModel` | Current stored `vote_weight` is the first extraction target.                         |
| `eligibility`        | XRPC vote eligibility handlers, `ProposalService.castVote`, membership read facade                                     | Must keep fail-closed membership behavior from Phase 3.                              |
| `quorum`             | `ProposalService.resolveProposal`, `MembershipReadModel.getProjectedClassWeightDenominator`                            | Preserve current simple/super-majority and class-quorum behavior before refactoring. |
| `actionAuthorizer`   | permissions middleware, proposal creation/update paths, suspension/member actions                                      | Axis names must remain visible in errors.                                            |
| `anchorSummary`      | proposal labels/anchors, public proposal response formatters                                                           | Must avoid leaking Tier 2/private details.                                           |
| `historicalState`    | membership read model snapshots, future membership cadence snapshots                                                   | This is the only plugin GovernanceView writes through.                               |
| `patronageAllocator` | `PatronageService.calculatePatronage`                                                                                  | CoopView-specific; do not put in generic package beyond interface.                   |
| `surplusDistributor` | `CapitalAccountService`, `Tax1099Service`                                                                              | CoopView-specific and fiscal-period-sensitive.                                       |
| `meetingMinutes`     | legal/meeting record services and `network.coopsource.legal.meetingRecord`                                             | Starts as a no-op until meeting records are better typed.                            |
| `delegateChains`     | `DelegationVotingService.getDelegationChain` / vote-weight delegation logic                                            | Keep cycle detection behavior covered by tests.                                      |

## Design Review Notes

Reviewed against the current implementation on 2026-07-06:

- `ProposalService.castVote` still stores `vote_weight`, now sourced from
  the composed `GovernancePluginSet.voteWeight`, backed by
  `MembershipReadModel.getProjectedMemberVoteWeight` through CoopView. The
  generic default therefore stays one-member-one-vote, while class weights stay
  CSN-specific.
- `ProposalService.resolveProposal` evaluates simple/super-majority quorum
  and CSN class-quorum rules through `GovernancePluginSet.quorum`. The API
  service still reads member counts, member classes, and class denominators,
  then passes plain values to CoopView.
- `checkVoteEligibility` combines active membership, existing-vote detection,
  and delegated vote weight. Active-member gating now goes through
  `GovernancePluginSet.eligibility`; existing-vote detection and delegated
  weight remain in the shared handler until later slices.
- `DelegationVotingService` now owns delegation creation/revocation, listing,
  chain reads, and active delegation-row queries. Generic
  `DelegateChainsPlugin` defaults to the direct voter only. CoopView adapts
  outgoing delegation chains separately from vote-weight expansion; the latter
  now flows through `CoopDelegatedVoteWeightReader` and `VoteWeightPlugin` with
  proposal context.
- `requirePermission` now uses `GovernancePluginSet.actionAuthorizer`.
  CoopView adapts the generic action string to a CSN permission read; the API
  bridge resolves active membership through `MembershipReadModel` and expands
  role inheritance through `resolveRolePermissions`. Proposal update/delete
  route checks now use the same authorizer with payload values for
  `proposalAuthorDid`, preserving the existing author-only and author-or-admin
  behavior.

## Extraction Order

1. Add `packages/governance-view` with value types, plugin interfaces, and
   default plugin set only. No service extraction. **Started 2026-07-06.**
2. Add tests proving default plugins produce one-member-one-vote behavior,
   eligible-by-default behavior, and no-op optional outputs. **Started
   2026-07-06.**
3. Add `packages/coop-view` as adapters over existing services, starting with
   `voteWeight`, `eligibility`, `quorum`, and `delegateChains`. **Started
   2026-07-06 with `CoopVoteWeightPlugin`; it depends on a
   `CoopVoteWeightReader` port instead of importing `MembershipReadModel`
   directly. Continued 2026-07-06 with `CoopEligibilityPlugin`; it depends on a
   `CoopVotingEligibilityReader` port and preserves fail-closed membership
   authority errors through the API bridge. `ProposalService.castVote` is now
   wired through the composed plugin set without changing stored vote-weight
   behavior; shared XRPC/Inlay vote eligibility now uses the composed
   eligibility plugin for active-member gating; `ProposalService.resolveProposal`
   now uses `CoopQuorumPlugin` for headcount and class-quorum decisions.
   `CoopDelegateChainsPlugin` is composed for outgoing chain resolution, with
   proposal-scope chains taking precedence over project-scope fallback. Cast
   vote and XRPC/Inlay eligibility now use `CoopDelegatedVoteWeightReader`,
   which combines membership base weights with active delegation rows inside
   `packages/coop-view`; `DelegationVotingService` no longer owns weighted
   expansion. Proposal-scope delegation still overrides project-scope
   delegation for the same delegator/proposal.**
4. Add `actionAuthorizer` as the permission boundary for existing route guards.
   **Started 2026-07-06. `CoopActionAuthorizerPlugin` delegates action strings
   to a narrow `CoopActionPermissionReader`; the API bridge uses
   `MembershipReadModel` plus `resolveRolePermissions`, and
   `requirePermission` now calls the composed plugin instead of resolving roles
   directly. Continued with proposal update/delete route checks: update remains
   author-only, delete remains author-or-admin, and both lookups are now scoped
   to the actor's cooperative before authorization.**
5. Move generic proposal/vote tally reducers out of `ProposalService` only after
   the adapter layer is tested against current proposal/vote/delegation suites.
   **Started 2026-07-06: `GovernanceView` now owns pure tally and outcome
   reducers for stored vote choices/weights, while `ProposalService` still owns
   vote queries, quorum plugin execution, persistence, anchors, and labels.**
6. Add `anchorSummary`, `historicalState`, patronage/distribution, and
   meeting-minutes adapters in separate slices.

## Non-Goals For The First Package Slice

- No schema changes.
- No `community.lexicon.governance.*` publication decision.
- No rewrite of HTTP/XRPC handlers.
- No migration of existing proposal/vote storage.
- No dependency on HappyView, Arbiter, or `@atproto/space`.

## Review Questions

1. Should `historicalState.recordSnapshot` be part of the plugin set from day
   one, or should GovernanceView own a separate snapshot port?
2. Should `patronageAllocator` and `surplusDistributor` stay in
   `GovernancePluginSet`, or should they be CoopView-only interfaces referenced
   by CoopView services?
3. Should `delegateChains.resolve` return the whole chain plus terminal actor,
   or return a weighted expansion directly?
4. Which generic value names should align with future
   `community.lexicon.governance.*` terms before draft lexicons are written?

## Next Slice

Continue `packages/coop-view` adapters without moving production service logic:

1. Decide the next extraction boundary for `DelegationVotingService`: outgoing
   chain reads and weighted expansion are adapted, while delegation
   creation/revocation and circularity checks still live in the API service.
   Treat creation/revocation as a separate command boundary before moving it.
   **Started 2026-07-06: CoopView now owns pure delegation command policy for
   self-delegation, proposal URI scope rules, project/proposal replacement, and
   effective circularity checks. The API service still owns DB reads/writes and
   maps policy denials to existing validation errors.**
2. Continue `actionAuthorizer` into remaining service-internal checks that are
   not currently represented by `requirePermission`, prioritizing vote
   retraction ownership and any member-management owner checks. **Continued
   2026-07-06: vote retraction and delegation revocation now use the composed
   action authorizer for service-layer ownership checks. Continued again with
   `MembershipService` command authorization for invitation creation, member
   approval, role assignment, removal, suspension, and reinstatement; the
   cooperative DID actor path remains an explicit system/authority bypass for
   bootstrap-style writes that are not active-member actions.**
3. Keep delegation command extraction separate if circularity rules need to
   become CoopView-owned policy.

When running package checks, avoid running a dependent package's tests while its
dependency package is rebuilding: current package exports point at `dist`, and
`prebuild` removes that directory.
