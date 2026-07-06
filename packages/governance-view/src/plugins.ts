import type {
  GovernanceActorRef,
  GovernanceDecisionContext,
  GovernanceGroupRef,
  GovernancePeriodRef,
  GovernanceProposalRef,
  GovernanceTallyInput,
  JsonValue,
} from './types.js';

export interface VoteWeightPlugin {
  weightForVote(input: {
    readonly voter: GovernanceActorRef;
    readonly proposal: GovernanceProposalRef;
    readonly cooperative: GovernanceGroupRef;
    readonly voteChoice: string;
    readonly at: string;
  }): Promise<{ readonly weight: number; readonly evidence?: JsonValue }>;
}

export interface EligibilityPlugin {
  canVote(input: {
    readonly voter: GovernanceActorRef;
    readonly proposal: GovernanceProposalRef;
    readonly cooperative: GovernanceGroupRef;
    readonly at: string;
  }): Promise<{
    readonly eligible: boolean;
    readonly reason?: string;
    readonly evidence?: JsonValue;
  }>;
}

export interface QuorumPlugin {
  evaluate(input: GovernanceTallyInput): Promise<{
    readonly met: boolean;
    readonly outcomeReason?: 'met' | 'no_quorum' | 'class_quorum_not_met';
    readonly evidence?: JsonValue;
  }>;
}

export interface ActionAuthorizerPlugin {
  authorize(input: GovernanceDecisionContext): Promise<{
    readonly authorized: boolean;
    readonly reason?: string;
  }>;
}

export interface AnchorSummaryPlugin {
  summarize(input: GovernanceDecisionContext): Promise<{
    readonly publicSummary: JsonValue | null;
  }>;
}

export interface HistoricalStatePlugin {
  readSnapshot(input: {
    readonly cooperative: GovernanceGroupRef;
    readonly at: string;
  }): Promise<{ readonly snapshotId?: string; readonly members?: JsonValue }>;

  recordSnapshot(input: {
    readonly cooperative: GovernanceGroupRef;
    readonly at: string;
    readonly members: JsonValue;
  }): Promise<{ readonly snapshotId: string }>;
}

export interface PatronageAllocatorPlugin {
  allocate(input: {
    readonly cooperative: GovernanceGroupRef;
    readonly period: GovernancePeriodRef;
    readonly surplus: number;
    readonly metrics: ReadonlyArray<JsonValue>;
  }): Promise<{ readonly allocations: ReadonlyArray<JsonValue> }>;
}

export interface SurplusDistributorPlugin {
  distribute(input: {
    readonly cooperative: GovernanceGroupRef;
    readonly period: GovernancePeriodRef;
    readonly allocations: ReadonlyArray<JsonValue>;
  }): Promise<{ readonly distributions: ReadonlyArray<JsonValue> }>;
}

export interface MeetingMinutesPlugin {
  canonicalize(input: {
    readonly cooperative: GovernanceGroupRef;
    readonly sourceRecords: ReadonlyArray<JsonValue>;
  }): Promise<{ readonly minutes: JsonValue | null }>;
}

export interface DelegateChainsPlugin {
  resolve(input: {
    readonly voter: GovernanceActorRef;
    readonly proposal: GovernanceProposalRef;
    readonly cooperative: GovernanceGroupRef;
    readonly at: string;
  }): Promise<{
    readonly chain: ReadonlyArray<GovernanceActorRef>;
    readonly terminal: GovernanceActorRef;
  }>;
}

export interface GovernancePluginSet {
  readonly voteWeight: VoteWeightPlugin;
  readonly eligibility: EligibilityPlugin;
  readonly quorum: QuorumPlugin;
  readonly actionAuthorizer: ActionAuthorizerPlugin;
  readonly anchorSummary: AnchorSummaryPlugin;
  readonly historicalState: HistoricalStatePlugin;
  readonly patronageAllocator: PatronageAllocatorPlugin;
  readonly surplusDistributor: SurplusDistributorPlugin;
  readonly meetingMinutes: MeetingMinutesPlugin;
  readonly delegateChains: DelegateChainsPlugin;
}
