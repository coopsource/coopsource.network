export interface CoopVoteWeightReader {
  getProjectedMemberVoteWeight(
    cooperativeDid: string,
    memberDid: string,
  ): Promise<number>;
}
