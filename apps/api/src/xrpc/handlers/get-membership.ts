import type { XrpcContext } from '../dispatcher.js';
import { NotFoundError } from '@coopsource/common';

export async function handleGetMembership(ctx: XrpcContext): Promise<unknown> {
  const cooperativeDid = ctx.params.cooperative as string;

  // Verify the cooperative exists and is active (no governance gate —
  // an authenticated person asking "am I a member?" should get
  // { isMember: false } for a closed coop, not 404).
  const coop = await ctx.container.db
    .selectFrom('entity')
    .where('did', '=', cooperativeDid)
    .where('type', '=', 'cooperative')
    .where('status', '=', 'active')
    .select('did')
    .executeTakeFirst();
  if (!coop) {
    throw new NotFoundError('Cooperative not found');
  }

  const viewerDid = ctx.viewer!.did;
  const member = await ctx.container.membershipService.getMember(
    cooperativeDid,
    viewerDid,
  );

  if (!member) {
    return { isMember: false };
  }

  return {
    isMember: member.status === 'active',
    status: member.status,
    roles: member.status === 'active' ? member.roles : undefined,
    joinedAt: member.joinedAt
      ? (member.joinedAt instanceof Date
          ? member.joinedAt.toISOString()
          : member.joinedAt)
      : undefined,
  };
}
