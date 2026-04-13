import type { XrpcContext } from '../dispatcher.js';
import { NotFoundError } from '@coopsource/common';
import { assertGovernanceAccess } from './open-governance-gate.js';
import { checkVoteEligibility } from './check-vote-eligibility.js';

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

  // Verify the cooperative allows governance access
  const { viewerMembership } = await assertGovernanceAccess(
    ctx.container.db,
    proposal.cooperative_did,
    ctx.viewer,
    ctx.container.membershipService,
  );

  return checkVoteEligibility(
    ctx.container.db,
    ctx.container.membershipService,
    ctx.container.delegationVotingService,
    proposal,
    viewerDid,
    viewerMembership,
  );
}
