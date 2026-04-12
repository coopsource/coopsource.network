import type { XrpcContext } from '../dispatcher.js';
import { assertOpenGovernance } from './open-governance-gate.js';

export async function handleGetMembership(ctx: XrpcContext): Promise<unknown> {
  const cooperativeDid = ctx.params.cooperative as string;
  await assertOpenGovernance(ctx.container.db, cooperativeDid);

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
