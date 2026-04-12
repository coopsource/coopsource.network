import type { XrpcContext } from '../dispatcher.js';
import { NotFoundError } from '@coopsource/common';
import { assertOpenGovernance } from './open-governance-gate.js';

export async function handleGetVoteEligibility(
  ctx: XrpcContext,
): Promise<unknown> {
  const proposalId = ctx.params.proposal as string;
  const viewerDid = ctx.viewer!.did;

  // Look up the proposal
  const result = await ctx.container.proposalService.getProposal(proposalId);
  if (!result) {
    throw new NotFoundError('Proposal not found');
  }

  const { proposal } = result;

  // Verify the cooperative has open governance
  await assertOpenGovernance(ctx.container.db, proposal.cooperative_did);

  // Check proposal is in voting phase (status 'open' in DB)
  if (proposal.status !== 'open') {
    return {
      eligible: false,
      weight: 0,
      hasVoted: false,
      reason: 'proposal_not_voting',
    };
  }

  // Check viewer is an active member
  const member = await ctx.container.membershipService.getMember(
    proposal.cooperative_did,
    viewerDid,
  );
  if (!member || member.status !== 'active') {
    return {
      eligible: false,
      weight: 0,
      hasVoted: false,
      reason: 'not_active_member',
    };
  }

  // Calculate vote weight (includes delegations)
  const weight =
    await ctx.container.delegationVotingService.calculateVoteWeight(
      proposal.cooperative_did,
      viewerDid,
      proposalId,
    );

  // Check if viewer has already voted (active vote = retracted_at IS NULL)
  const existingVote = await ctx.container.db
    .selectFrom('vote')
    .where('proposal_id', '=', proposalId)
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
