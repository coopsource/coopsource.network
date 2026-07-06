import type { DID } from '@coopsource/common';
import type {
  CoopVoteWeightReader,
  CoopVotingEligibilityReader,
} from '@coopsource/coop-view';
import {
  membershipAuthorityAppError,
  type MembershipReadModel,
} from './membership-read-model.js';

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

export class MembershipReadModelVotingEligibilityReader
  implements CoopVotingEligibilityReader
{
  constructor(
    private readonly membershipReadModel: Pick<
      MembershipReadModel,
      'getActiveMembershipResult'
    >,
  ) {}

  async canMemberVote(
    cooperativeDid: string,
    memberDid: string,
  ): Promise<{ readonly eligible: boolean; readonly reason?: string }> {
    const result = await this.membershipReadModel.getActiveMembershipResult(
      cooperativeDid as DID,
      memberDid as DID,
    );

    if (result.ok) {
      return { eligible: true };
    }

    if (result.reason === 'not-member') {
      return { eligible: false, reason: result.message };
    }

    throw membershipAuthorityAppError(result, 403, 'FORBIDDEN');
  }
}
