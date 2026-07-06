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
