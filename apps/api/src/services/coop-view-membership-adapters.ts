import type { DID } from '@coopsource/common';
import type { CoopVoteWeightReader } from '@coopsource/coop-view';
import type { MembershipReadModel } from './membership-read-model.js';

export class MembershipReadModelVoteWeightReader
  implements CoopVoteWeightReader
{
  constructor(
    private readonly membershipReadModel: Pick<
      MembershipReadModel,
      'getProjectedMemberVoteWeight'
    >,
  ) {}

  getProjectedMemberVoteWeight(
    cooperativeDid: string,
    memberDid: string,
  ): Promise<number> {
    return this.membershipReadModel.getProjectedMemberVoteWeight(
      cooperativeDid as DID,
      memberDid as DID,
    );
  }
}
