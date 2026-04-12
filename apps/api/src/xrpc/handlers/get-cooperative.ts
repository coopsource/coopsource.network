import type { XrpcContext } from '../dispatcher.js';
import { assertGovernanceAccess } from './open-governance-gate.js';

export async function handleGetCooperative(ctx: XrpcContext): Promise<unknown> {
  const cooperativeDid = ctx.params.cooperative as string;
  const { coop } = await assertGovernanceAccess(
    ctx.container.db,
    cooperativeDid,
    ctx.viewer,
    ctx.container.membershipService,
  );

  return {
    did: coop.did,
    handle: coop.handle ?? coop.did,
    displayName: coop.display_name,
    description: coop.description ?? undefined,
    avatarCid: coop.avatar_cid ?? undefined,
    cooperativeType: coop.cooperative_type,
    membershipPolicy: coop.membership_policy,
    maxMembers: coop.max_members ?? undefined,
    location: coop.location ?? undefined,
    website: coop.website ?? undefined,
    foundedDate: coop.founded_date ?? undefined,
    governanceVisibility: coop.governance_visibility,
    isNetwork: coop.is_network,
  };
}
