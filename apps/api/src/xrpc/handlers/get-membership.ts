import type { XrpcContext } from '../dispatcher.js';
import { AppError, NotFoundError, type DID } from '@coopsource/common';
import {
  membershipAuthorityErrorCode,
  membershipAuthorityHttpStatus,
} from '../../services/membership-read-model.js';

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
  const memberResult = await ctx.container.membershipReadModel.getMemberResult(
    cooperativeDid as DID,
    viewerDid as DID,
  );

  if (!memberResult.ok) {
    if (memberResult.reason === 'not-member') {
      return { isMember: false };
    }
    throw new AppError(
      memberResult.message,
      membershipAuthorityHttpStatus(memberResult, 404),
      membershipAuthorityErrorCode(memberResult, 'NotFound'),
    );
  }

  const member = memberResult.member;
  if (!member) {
    return { isMember: false };
  }

  return {
    isMember: member.status === 'active',
    status: member.status,
    roles: member.status === 'active' ? member.roles : undefined,
    joinedAt: member.joinedAt
      ? member.joinedAt instanceof Date
        ? member.joinedAt.toISOString()
        : member.joinedAt
      : undefined,
  };
}
