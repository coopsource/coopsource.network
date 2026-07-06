# V12 Phase 5 GovernanceView / CoopView Interface Design

**Date:** 2026-07-06
**Status:** Draft for review before package extraction. Do not create
`packages/governance-view` or `packages/coop-view` until this interface shape
has been reviewed against current proposal/vote/delegation tests.

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

## Extraction Order

1. Add `packages/governance-view` with value types, plugin interfaces, and
   default plugin set only. No service extraction.
2. Add tests proving default plugins produce one-member-one-vote behavior,
   eligible-by-default behavior, and no-op optional outputs.
3. Add `packages/coop-view` as adapters over existing services, starting with
   `voteWeight`, `eligibility`, `quorum`, and `delegateChains`.
4. Move generic proposal/vote tally reducers out of `ProposalService` only after
   the adapter layer is tested against current proposal/vote/delegation suites.
5. Add `anchorSummary`, `historicalState`, patronage/distribution, and
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

After review, implement only step 1 and step 2 from the extraction order:
interfaces, default plugin set, and tests. Then wire no production code until
the default behavior and current proposal/vote tests agree on semantics.
