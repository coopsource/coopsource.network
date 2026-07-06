export interface CoopVoteWeightReader {
  getProjectedMemberVoteWeight(
    cooperativeDid: string,
    memberDid: string,
  ): Promise<number>;
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

export interface CoopDelegationLink {
  readonly delegatorDid: string;
  readonly delegateeDid: string;
}

export interface CoopDelegateChainReader {
  resolveDelegateChain(input: {
    readonly cooperativeDid: string;
    readonly voterDid: string;
    readonly proposalUri: string;
  }): Promise<readonly CoopDelegationLink[]>;
}
