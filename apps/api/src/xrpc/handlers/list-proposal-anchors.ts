import type { XrpcContext } from '../dispatcher.js';

export async function handleListProposalAnchors(
  ctx: XrpcContext,
): Promise<unknown> {
  const cooperativeDid = ctx.params.cooperative as string;
  const limit = (ctx.params.limit as number | undefined) ?? 50;
  const cursor = ctx.params.cursor as string | undefined;
  const status = ctx.params.status as string | undefined;

  const result = await ctx.container.proposalService.listPublicProposalAnchors(
    cooperativeDid,
    { limit, cursor, status },
  );

  return {
    anchors: result.items.map((row) => ({
      uri: row.anchor_uri,
      cooperativeDid: row.cooperative_did,
      proposalId: row.proposal_id,
      status: row.status,
      outcome: row.outcome ?? undefined,
      openedAt: row.opened_at ? toIsoString(row.opened_at) : undefined,
      closedAt: row.closed_at ? toIsoString(row.closed_at) : undefined,
      resolvedAt: row.resolved_at ? toIsoString(row.resolved_at) : undefined,
      updatedAt: toIsoString(row.updated_at),
      anchorVersion: row.anchor_version,
    })),
    cursor: result.cursor,
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
