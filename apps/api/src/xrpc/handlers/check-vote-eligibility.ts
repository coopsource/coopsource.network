import type { Kysely, Selectable } from 'kysely';
import type { Database, ProposalTable } from '@coopsource/db';
import { membersSpace } from '@coopsource/arbiter-client';
import type { DID } from '@coopsource/common';
import type { EligibilityPlugin } from '@coopsource/governance-view';
import type { MemberDirectoryEntry } from '../../services/membership-read-model.js';
import type { DelegationVotingService } from '../../services/delegation-voting-service.js';

const PROPOSAL_COLLECTION = 'network.coopsource.governance.proposal';

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
  eligibilityPlugin: EligibilityPlugin,
  delegationVotingService: DelegationVotingService,
  proposal: Selectable<ProposalTable>,
  viewerDid: string,
  checkedAt: Date,
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
  const membershipEligible = viewerMembership
    ? viewerMembership.status === 'active'
    : (await eligibilityPlugin.canVote(
        eligibilityInput(proposal, viewerDid, checkedAt),
      )).eligible;
  if (!membershipEligible) {
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

function eligibilityInput(
  proposal: Selectable<ProposalTable>,
  viewerDid: string,
  checkedAt: Date,
): Parameters<EligibilityPlugin['canVote']>[0] {
  if (!proposal.uri) {
    throw new Error(
      `Cannot check vote eligibility for proposal ${proposal.id}: missing proposal URI`,
    );
  }

  const memberSpace = membersSpace(proposal.cooperative_did as DID);
  return {
    voter: { did: viewerDid },
    proposal: {
      uri: proposal.uri,
      ...(proposal.cid ? { cid: proposal.cid } : {}),
      collection: PROPOSAL_COLLECTION,
    },
    cooperative: {
      authorityDid: proposal.cooperative_did,
      spaceKey: memberSpace.spaceKey,
      spaceType: memberSpace.expectedSpaceType,
    },
    at: checkedAt.toISOString(),
  };
}
