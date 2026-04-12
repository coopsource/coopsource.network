import type { XrpcContext } from '../dispatcher.js';
import { NotFoundError } from '@coopsource/common';
import { assertGovernanceAccess } from './open-governance-gate.js';

export async function handleGetProposal(ctx: XrpcContext): Promise<unknown> {
  const id = ctx.params.id as string;

  const result = await ctx.container.proposalService.getProposal(id);
  if (!result) {
    throw new NotFoundError('Proposal not found');
  }

  const { proposal, voteSummary } = result;

  // Verify the proposal's cooperative allows governance access
  await assertGovernanceAccess(
    ctx.container.db,
    proposal.cooperative_did,
    ctx.viewer,
    ctx.container.membershipService,
  );

  // Convert voteSummary map to tally array
  const tally = Object.entries(voteSummary).map(([choice, count]) => ({
    choice,
    count,
  }));

  return {
    id: proposal.id,
    title: proposal.title,
    body: proposal.body,
    status: proposal.status,
    votingType: proposal.voting_type,
    options: proposal.options ?? undefined,
    quorumType: proposal.quorum_type ?? undefined,
    quorumBasis: proposal.quorum_basis ?? undefined,
    cooperativeDid: proposal.cooperative_did,
    authorDid: proposal.author_did,
    createdAt: proposal.created_at instanceof Date
      ? proposal.created_at.toISOString()
      : proposal.created_at,
    resolvedAt: proposal.resolved_at
      ? (proposal.resolved_at instanceof Date
          ? proposal.resolved_at.toISOString()
          : proposal.resolved_at)
      : undefined,
    tally,
  };
}
