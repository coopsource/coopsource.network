import type { XrpcContext } from '../dispatcher.js';
import { assertOpenGovernance } from './open-governance-gate.js';

export async function handleGetCooperative(ctx: XrpcContext): Promise<unknown> {
  const cooperativeDid = ctx.params.cooperative as string;
  const row = await assertOpenGovernance(ctx.container.db, cooperativeDid);

  return {
    did: row.did,
    handle: row.handle ?? row.did,
    displayName: row.display_name,
    description: row.description ?? undefined,
    avatarCid: row.avatar_cid ?? undefined,
    cooperativeType: row.cooperative_type,
    membershipPolicy: row.membership_policy,
    maxMembers: row.max_members ?? undefined,
    location: row.location ?? undefined,
    website: row.website ?? undefined,
    foundedDate: row.founded_date ?? undefined,
    governanceVisibility: row.governance_visibility,
    isNetwork: row.is_network,
  };
}
