import type { Kysely, Selectable } from 'kysely';
import type { Database, ProposalTable } from '@coopsource/db';
import { AppError, type DID } from '@coopsource/common';
import {
  membershipAuthorityErrorCode,
  membershipAuthorityHttpStatus,
  type MemberDirectoryEntry,
  type MembershipReadModel,
} from '../../services/membership-read-model.js';
import type { DelegationVotingService } from '../../services/delegation-voting-service.js';

export interface VoteEligibilityResult {
  eligible: boolean;
  weight: number;
  hasVoted: boolean;
  reason?: string;
}

/**
 * Core vote eligibility logic shared between the XRPC getVoteEligibility
 * handler and the Inlay VoteWidget handler.
 *
 * Callers that already resolved viewerMembership (e.g. from assertGovernanceAccess
 * on closed coops) can pass it to skip a redundant membership lookup.
 */
export async function checkVoteEligibility(
  db: Kysely<Database>,
  membershipReadModel: MembershipReadModel,
  delegationVotingService: DelegationVotingService,
  proposal: Selectable<ProposalTable>,
  viewerDid: string,
  viewerMembership?: MemberDirectoryEntry,
): Promise<VoteEligibilityResult> {
  // Check proposal is in voting phase
  if (proposal.status !== 'open') {
    return {
      eligible: false,
      weight: 0,
      hasVoted: false,
      reason: 'proposal_not_voting',
    };
  }

  // Check active membership
  let member = viewerMembership;
  if (!member) {
    const memberResult = await membershipReadModel.getMemberResult(
      proposal.cooperative_did as DID,
      viewerDid as DID,
    );
    if (!memberResult.ok) {
      if (memberResult.reason !== 'not-member') {
        throw new AppError(
          memberResult.message,
          membershipAuthorityHttpStatus(memberResult, 404),
          membershipAuthorityErrorCode(memberResult, 'NotFound'),
        );
      }
    } else {
      member = memberResult.member ?? undefined;
    }
  }
  if (!member || member.status !== 'active') {
    return {
      eligible: false,
      weight: 0,
      hasVoted: false,
      reason: 'not_active_member',
    };
  }

  // Calculate vote weight (includes delegations)
  const weight = await delegationVotingService.calculateVoteWeight(
    proposal.cooperative_did,
    viewerDid,
    proposal.id,
  );

  // Check if viewer has already voted (active vote = retracted_at IS NULL)
  const existingVote = await db
    .selectFrom('vote')
    .where('proposal_id', '=', proposal.id)
    .where('voter_did', '=', viewerDid)
    .where('retracted_at', 'is', null)
    .select('id')
    .executeTakeFirst();

  const hasVoted = !!existingVote;

  if (hasVoted) {
    return {
      eligible: false,
      weight,
      hasVoted: true,
      reason: 'already_voted',
    };
  }

  return {
    eligible: true,
    weight,
    hasVoted: false,
  };
}
