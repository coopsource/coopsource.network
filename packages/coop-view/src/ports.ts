import type { JsonValue } from '@coopsource/governance-view';

export interface CoopVoteWeightReader {
  getProjectedMemberVoteWeight(input: {
    readonly cooperativeDid: string;
    readonly memberDid: string;
    readonly proposalUri: string;
    readonly voteChoice: string;
    readonly at: string;
  }): Promise<number>;
}

export interface CoopBaseVoteWeightReader {
  getBaseMemberVoteWeight(input: {
    readonly cooperativeDid: string;
    readonly memberDid: string;
    readonly at: string;
  }): Promise<number>;
}

export interface CoopVotingEligibility {
  readonly eligible: boolean;
  readonly reason?: string;
}

export interface CoopVotingEligibilityReader {
  canMemberVote(
    cooperativeDid: string,
    memberDid: string,
  ): Promise<CoopVotingEligibility>;
}

export interface CoopActionAuthorization {
  readonly authorized: boolean;
  readonly reason?: string;
}

export interface CoopActionPermissionReader {
  canActorPerformAction(input: {
    readonly cooperativeDid: string;
    readonly actorDid: string;
    readonly action: string;
    readonly at: string;
    readonly payload?: JsonValue;
  }): Promise<CoopActionAuthorization>;
}

export interface CoopDelegationLink {
  readonly delegatorDid: string;
  readonly delegateeDid: string;
}

export type CoopDelegationScope = 'project' | 'proposal';

export interface CoopVoteWeightDelegation {
  readonly delegatorDid: string;
  readonly delegateeDid: string;
  readonly scope: CoopDelegationScope;
  readonly proposalUri?: string | null;
}

export interface CoopVoteWeightDelegationReader {
  listActiveDelegationsForVoteWeight(input: {
    readonly cooperativeDid: string;
    readonly proposalUri: string;
    readonly at: string;
  }): Promise<readonly CoopVoteWeightDelegation[]>;
}

export interface CoopDelegateChainReader {
  resolveDelegateChain(input: {
    readonly cooperativeDid: string;
    readonly voterDid: string;
    readonly proposalUri: string;
  }): Promise<readonly CoopDelegationLink[]>;
}
