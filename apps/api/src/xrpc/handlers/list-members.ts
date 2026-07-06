import { AppError, type DID } from '@coopsource/common';
import type { XrpcContext } from '../dispatcher.js';
import {
  membershipAuthorityErrorCode,
  membershipAuthorityHttpStatus,
} from '../../services/membership-read-model.js';
import { assertGovernanceAccess } from './open-governance-gate.js';

export async function handleListMembers(ctx: XrpcContext): Promise<unknown> {
  const cooperativeDid = ctx.params.cooperative as string;
  const { viewerMembership } = await assertGovernanceAccess(
    ctx.container.db,
    cooperativeDid,
    ctx.viewer,
    ctx.container.membershipReadModel,
  );

  const limit = (ctx.params.limit as number | undefined) ?? 50;
  const cursor = ctx.params.cursor as string | undefined;

  const result = await ctx.container.membershipReadModel.listMembersResult(
    cooperativeDid as DID,
    { limit, cursor },
  );
  if (!result.ok) {
    throw new AppError(
      result.message,
      membershipAuthorityHttpStatus(result, 503),
      membershipAuthorityErrorCode(result, 'MembershipAuthorityUnavailable'),
    );
  }

  // Only include active members in the directory
  const activeMembers = result.page.items.filter((m) => m.status === 'active');

  // Determine caller context for three-tier privacy
  const viewer = ctx.viewer;
  let isFellowMember = false;

  if (viewerMembership) {
    isFellowMember = viewerMembership.status === 'active';
  } else if (viewer) {
    const membership = await ctx.container.membershipReadModel.getMemberResult(
      cooperativeDid as DID,
      viewer.did as DID,
    );
    if (!membership.ok) {
      if (membership.reason !== 'not-member') {
        throw new AppError(
          membership.message,
          membershipAuthorityHttpStatus(membership, 404),
          membershipAuthorityErrorCode(membership, 'NotFound'),
        );
      }
    } else {
      isFellowMember = membership.member?.status === 'active';
    }
  }

  const members = activeMembers
    .filter((m) => {
      // Tier 1 (no auth): only directory-visible members
      if (!viewer) return m.directoryVisible;
      // Tier 2 & 3 (authed): all members visible
      return true;
    })
    .map((m) => {
      // Tier 3 (fellow member) or directory-visible: full detail
      if (isFellowMember || m.directoryVisible) {
        return {
          did: m.did,
          displayName: m.displayName,
          roles: m.roles,
          joinedAt: m.joinedAt
            ? m.joinedAt instanceof Date
              ? m.joinedAt.toISOString()
              : m.joinedAt
            : undefined,
          private: false,
        };
      }

      // Tier 2 (authed non-member, private member): redacted
      return {
        did: m.did,
        joinedAt: m.joinedAt
          ? m.joinedAt instanceof Date
            ? m.joinedAt.toISOString()
            : m.joinedAt
          : undefined,
        private: true,
      };
    });

  return {
    members,
    cursor: result.page.cursor,
  };
}
