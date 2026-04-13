import { $, serializeTree } from '@inlay/core';
import { AppError, NotFoundError } from '@coopsource/common';
import type { XrpcContext } from '../dispatcher.js';

const STATUS_LABELS: Record<string, string> = {
  open: 'Open for voting',
  closed: 'Voting closed',
  resolved: 'Resolved',
};

/**
 * Inlay external component: GovernanceFeed (non-personalized).
 *
 * Shows recent governance activity for a cooperative. Uses listPublicProposals
 * to exclude drafts. For closed-governance cooperatives, returns a graceful
 * fallback tree.
 *
 * POST /xrpc/network.coopsource.inlay.GovernanceFeed
 * Body: { did: cooperativeDid }
 * Auth: none
 * Returns: { node, cache }
 */
export async function handleInlayGovernanceFeed(
  ctx: XrpcContext,
): Promise<unknown> {
  const cooperativeDid = ctx.params.did as string;
  if (!cooperativeDid) {
    throw new AppError('Missing cooperative DID', 400, 'InvalidRequest');
  }

  const coop = await ctx.container.db
    .selectFrom('entity')
    .innerJoin('cooperative_profile', 'cooperative_profile.entity_did', 'entity.did')
    .where('entity.did', '=', cooperativeDid)
    .where('entity.type', '=', 'cooperative')
    .where('entity.status', '=', 'active')
    .select(['entity.did', 'entity.display_name', 'cooperative_profile.governance_visibility'])
    .executeTakeFirst();

  if (!coop) {
    throw new NotFoundError('Cooperative not found');
  }

  // Closed governance: return fallback (mixed + open proceed normally)
  if (coop.governance_visibility === 'closed') {
    const tree = serializeTree(
      $('org.atsui.Stack', { gap: 'small' },
        $('org.atsui.Caption', {}, 'This cooperative\'s governance is private'),
      ),
    );
    return { node: tree, cache: { life: 'hours' } };
  }

  const proposals = await ctx.container.proposalService.listPublicProposals(
    cooperativeDid,
    5,
  );

  if (proposals.length === 0) {
    const tree = serializeTree(
      $('org.atsui.Stack', { gap: 'small' },
        $('org.atsui.Title', {}, coop.display_name),
        $('org.atsui.Caption', {}, 'No governance activity yet'),
      ),
    );
    return { node: tree, cache: { life: 'hours' } };
  }

  const tree = serializeTree(
    $('org.atsui.Stack', { gap: 'small' },
      $('org.atsui.Title', {}, coop.display_name),
      ...proposals.map((p) => {
        const createdAt = p.created_at instanceof Date
          ? p.created_at.toISOString()
          : String(p.created_at);

        return $('org.atsui.Stack', { gap: 'small' },
          $('org.atsui.Title', {}, p.title),
          $('org.atsui.Row', { gap: 'small' },
            $('org.atsui.Caption', {}, STATUS_LABELS[p.status] ?? p.status),
            $('org.atsui.Timestamp', { value: createdAt }),
          ),
        );
      }),
    ),
  );

  return { node: tree, cache: { life: 'minutes' } };
}
