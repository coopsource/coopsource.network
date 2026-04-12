import type { XrpcContext } from '../dispatcher.js';
import { assertGovernanceAccess } from './open-governance-gate.js';

export async function handleListProposals(ctx: XrpcContext): Promise<unknown> {
  const cooperativeDid = ctx.params.cooperative as string;
  await assertGovernanceAccess(
    ctx.container.db,
    cooperativeDid,
    ctx.viewer,
    ctx.container.membershipService,
  );

  const limit = (ctx.params.limit as number | undefined) ?? 50;
  const cursor = ctx.params.cursor as string | undefined;
  const status = ctx.params.status as string | undefined;

  const result = await ctx.container.proposalService.listProposals(
    cooperativeDid,
    { limit, cursor, status },
  );

  return {
    proposals: result.items.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      votingType: row.voting_type,
      cooperativeDid: row.cooperative_did,
      authorDid: row.author_did,
      createdAt: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
      resolvedAt: row.resolved_at
        ? (row.resolved_at instanceof Date
            ? row.resolved_at.toISOString()
            : row.resolved_at)
        : undefined,
    })),
    cursor: result.cursor,
  };
}
