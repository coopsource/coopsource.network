export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | ReadonlyArray<JsonValue>;

export type GovernanceAction = string;

export interface GovernanceActorRef {
  readonly did: string;
}

export interface GovernanceGroupRef {
  readonly authorityDid: string;
  readonly spaceKey: string;
  readonly spaceType?: string;
}

export interface GovernanceRecordRef {
  readonly uri: string;
  readonly cid?: string;
  readonly collection: string;
}

export type GovernanceProposalRef = GovernanceRecordRef;
export type GovernanceVoteRef = GovernanceRecordRef;

export interface GovernancePeriodRef {
  readonly id: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
}

export interface GovernanceDecisionContext {
  readonly proposal?: GovernanceProposalRef;
  readonly cooperative: GovernanceGroupRef;
  readonly action: GovernanceAction;
  readonly actor: GovernanceActorRef;
  readonly at: string;
  readonly payload?: JsonValue;
}

export interface GovernanceVoteForTally {
  readonly voter: GovernanceActorRef;
  readonly choice: string;
  readonly weight?: number;
  readonly memberClass?: string | null;
  readonly at?: string;
}

export interface GovernanceClassDenominator {
  readonly className: string;
  readonly totalWeight: number;
  readonly totalMembers?: number;
}

export interface GovernanceClassQuorumRule {
  readonly minVotes?: number;
  readonly minWeightRatio?: number;
}

export interface GovernanceQuorumConfig {
  readonly type?: 'none' | 'simpleMajority' | 'superMajority';
  readonly threshold?: number;
}

export interface GovernanceTallyInput {
  readonly proposal: GovernanceProposalRef;
  readonly cooperative: GovernanceGroupRef;
  readonly votes: ReadonlyArray<GovernanceVoteForTally>;
  readonly eligibleVoterCount: number;
  readonly quorum?: GovernanceQuorumConfig;
  readonly classDenominators?: ReadonlyArray<GovernanceClassDenominator>;
  readonly classQuorumRules?: Readonly<
    Record<string, GovernanceClassQuorumRule>
  >;
}
