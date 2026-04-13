import { $, serializeTree } from '@inlay/core';
import { AppError, NotFoundError } from '@coopsource/common';
import type { XrpcContext } from '../dispatcher.js';

/**
 * Inlay external component: MembershipStatus (personalized).
 *
 * Shows the viewer's membership status in a cooperative. The Inlay host sends
 * a viewer JWT (iss = viewer's DID) and a cooperative DID as input. CSN
 * verifies the JWT, looks up the bilateral membership, and returns an element
 * tree showing the viewer's membership state and roles.
 *
 * POST /xrpc/network.coopsource.inlay.MembershipStatus
 * Body: { did: cooperativeDid }
 * Auth: personalized (viewer JWT via InlayAuthVerifier)
 * Returns: { node, cache } (at.inlay.defs#response)
 */
export async function handleInlayMembershipStatus(
  ctx: XrpcContext,
): Promise<unknown> {
  const cooperativeDid = ctx.params.did as string;
  if (!cooperativeDid) {
    throw new AppError('Missing cooperative DID', 400, 'InvalidRequest');
  }

  // Verify the cooperative exists and check governance visibility
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

  const viewerDid = ctx.viewer?.did;

  // Closed-governance cooperatives: hide from non-members (same as assertGovernanceAccess)
  if (coop.governance_visibility === 'closed') {
    if (!viewerDid) {
      throw new NotFoundError('Cooperative not found');
    }
    const member = await ctx.container.membershipService.getMember(cooperativeDid, viewerDid);
    if (!member || member.status !== 'active') {
      throw new NotFoundError('Cooperative not found');
    }
  }

  // Non-personalized fallback: show cooperative name only
  if (!viewerDid) {
    const tree = serializeTree(
      $('org.atsui.Stack', { gap: 'small' },
        $('org.atsui.Caption', {}, coop.display_name),
        $('org.atsui.Caption', {}, 'Sign in to see your membership status'),
      ),
    );
    return { node: tree, cache: { life: 'hours' } };
  }

  // Look up the viewer's membership
  const member = await ctx.container.membershipService.getMember(
    cooperativeDid,
    viewerDid,
  );

  if (!member || member.status !== 'active') {
    const tree = serializeTree(
      $('org.atsui.Stack', { gap: 'small' },
        $('org.atsui.Caption', {}, coop.display_name),
        $('org.atsui.Caption', {}, 'Not a member'),
      ),
    );
    return { node: tree, cache: { life: 'minutes' } };
  }

  // Active member — show roles
  const roleText = member.roles.length > 0
    ? member.roles.join(', ')
    : 'member';

  const tree = serializeTree(
    $('org.atsui.Stack', { gap: 'small' },
      $('org.atsui.Title', {}, coop.display_name),
      $('org.atsui.Row', { gap: 'small' },
        $('org.atsui.Caption', {}, '✓ Active member'),
      ),
      $('org.atsui.Caption', {}, `Roles: ${roleText}`),
    ),
  );

  return {
    node: tree,
    cache: {
      life: 'minutes',
      tags: [
        { uri: `at://${cooperativeDid}/network.coopsource.org.membership` },
        { uri: `at://${cooperativeDid}/network.coopsource.org.memberApproval` },
      ],
    },
  };
}
