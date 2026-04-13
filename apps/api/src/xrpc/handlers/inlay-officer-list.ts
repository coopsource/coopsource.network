import { $, serializeTree } from '@inlay/core';
import { AppError, NotFoundError } from '@coopsource/common';
import type { XrpcContext } from '../dispatcher.js';

/**
 * Inlay external component: OfficerList (non-personalized).
 *
 * Shows current officers for a cooperative. For closed-governance cooperatives,
 * returns a graceful fallback tree instead of 404 (the host already knows the
 * cooperative DID, so concealing its existence has no privacy benefit).
 *
 * POST /xrpc/network.coopsource.inlay.OfficerList
 * Body: { did: cooperativeDid }
 * Auth: none
 * Returns: { node, cache }
 */
export async function handleInlayOfficerList(
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

  const officers = await ctx.container.officerRecordService.getCurrent(cooperativeDid);

  if (officers.length === 0) {
    const tree = serializeTree(
      $('org.atsui.Stack', { gap: 'small' },
        $('org.atsui.Title', {}, coop.display_name),
        $('org.atsui.Caption', {}, 'No officers appointed'),
      ),
    );
    return { node: tree, cache: { life: 'hours' } };
  }

  // Batch look up display names
  const officerDids = officers.map((o) => o.officer_did);
  const entities = await ctx.container.db
    .selectFrom('entity')
    .where('did', 'in', officerDids)
    .select(['did', 'display_name'])
    .execute();
  const nameMap = new Map(entities.map((e) => [e.did, e.display_name]));

  const tree = serializeTree(
    $('org.atsui.Stack', { gap: 'small' },
      $('org.atsui.Title', {}, coop.display_name),
      ...officers.map((o) => {
        const appointedAt = o.appointed_at instanceof Date
          ? o.appointed_at.toISOString()
          : String(o.appointed_at);

        const children = [
          $('org.atsui.Caption', {}, nameMap.get(o.officer_did) ?? 'Unknown'),
          $('org.atsui.Caption', {}, o.title),
          $('org.atsui.Timestamp', { value: appointedAt }),
        ];

        if (o.term_ends_at) {
          const termEndsAt = o.term_ends_at instanceof Date
            ? o.term_ends_at.toISOString()
            : String(o.term_ends_at);
          children.push(
            $('org.atsui.Caption', {}, 'Term ends: '),
            $('org.atsui.Timestamp', { value: termEndsAt }),
          );
        }

        return $('org.atsui.Row', { gap: 'small' }, ...children);
      }),
    ),
  );

  return { node: tree, cache: { life: 'hours' } };
}
