import type { XrpcContext } from '../dispatcher.js';
import { assertGovernanceAccess } from './open-governance-gate.js';

export async function handleListMembers(ctx: XrpcContext): Promise<unknown> {
  const cooperativeDid = ctx.params.cooperative as string;
  const { viewerMembership } = await assertGovernanceAccess(
    ctx.container.db,
    cooperativeDid,
    ctx.viewer,
    ctx.container.membershipService,
  );

  const limit = (ctx.params.limit as number | undefined) ?? 50;
  const cursor = ctx.params.cursor as string | undefined;

  const result = await ctx.container.membershipService.listMembers(
    cooperativeDid,
    { limit, cursor },
  );

  // Only include active members in the directory
  const activeMembers = result.items.filter((m) => m.status === 'active');

  // Determine caller context for three-tier privacy
  const viewer = ctx.viewer;
  let isFellowMember = false;

  if (viewerMembership) {
    isFellowMember = viewerMembership.status === 'active';
  } else if (viewer) {
    const membership = await ctx.container.membershipService.getMember(
      cooperativeDid,
      viewer.did,
    );
    isFellowMember = membership?.status === 'active';
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
            ? (m.joinedAt instanceof Date
                ? m.joinedAt.toISOString()
                : m.joinedAt)
            : undefined,
          private: false,
        };
      }

      // Tier 2 (authed non-member, private member): redacted
      return {
        did: m.did,
        joinedAt: m.joinedAt
          ? (m.joinedAt instanceof Date
              ? m.joinedAt.toISOString()
              : m.joinedAt)
          : undefined,
        private: true,
      };
    });

  return {
    members,
    cursor: result.cursor,
  };
}
