import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { NotFoundError } from '@coopsource/common';
import type { MembershipService, MemberWithRoles } from '../../services/membership-service.js';

export interface CooperativeRow {
  did: string;
  type: string;
  display_name: string;
  description: string | null;
  handle: string | null;
  avatar_cid: string | null;
  status: string;
  cooperative_type: string;
  membership_policy: string;
  max_members: number | null;
  location: string | null;
  website: string | null;
  founded_date: string | null;
  governance_visibility: string;
  is_network: boolean;
  anon_discoverable: boolean;
  public_description: boolean;
  public_members: boolean;
  public_activity: boolean;
  public_agreements: boolean;
  public_campaigns: boolean;
}

export interface GovernanceAccessResult {
  coop: CooperativeRow;
  viewerMembership?: MemberWithRoles;
}

/**
 * Verify a cooperative exists and is active, then enforce governance visibility.
 *
 * - open / mixed: return immediately (backward compatible, no membership check)
 * - closed: require an authenticated viewer who is an active member
 *
 * Returns the full joined row plus optional viewer membership so handlers can
 * reuse both without redundant queries.
 */
export async function assertGovernanceAccess(
  db: Kysely<Database>,
  cooperativeDid: string,
  viewer?: { did: string; displayName: string },
  membershipService?: MembershipService,
): Promise<GovernanceAccessResult> {
  const row = await db
    .selectFrom('entity')
    .innerJoin(
      'cooperative_profile',
      'cooperative_profile.entity_did',
      'entity.did',
    )
    .where('entity.did', '=', cooperativeDid)
    .where('entity.type', '=', 'cooperative')
    .where('entity.status', '=', 'active')
    .select([
      'entity.did',
      'entity.type',
      'entity.display_name',
      'entity.description',
      'entity.handle',
      'entity.avatar_cid',
      'entity.status',
      'cooperative_profile.cooperative_type',
      'cooperative_profile.membership_policy',
      'cooperative_profile.max_members',
      'cooperative_profile.location',
      'cooperative_profile.website',
      'cooperative_profile.founded_date',
      'cooperative_profile.governance_visibility',
      'cooperative_profile.is_network',
      'cooperative_profile.anon_discoverable',
      'cooperative_profile.public_description',
      'cooperative_profile.public_members',
      'cooperative_profile.public_activity',
      'cooperative_profile.public_agreements',
      'cooperative_profile.public_campaigns',
    ])
    .executeTakeFirst();

  if (!row) {
    throw new NotFoundError('Cooperative not found');
  }

  const coop = row as CooperativeRow;

  // Open and mixed governance: public access, no membership check needed
  if (coop.governance_visibility === 'open' || coop.governance_visibility === 'mixed') {
    return { coop };
  }

  // Closed governance: require authenticated viewer with active membership
  if (!viewer || !membershipService) {
    throw new NotFoundError('Cooperative not found');
  }

  const member = await membershipService.getMember(cooperativeDid, viewer.did);
  if (!member || member.status !== 'active') {
    throw new NotFoundError('Cooperative not found');
  }

  return { coop, viewerMembership: member };
}
