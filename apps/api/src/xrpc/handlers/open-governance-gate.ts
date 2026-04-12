import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { NotFoundError } from '@coopsource/common';

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

/**
 * Verify a cooperative exists, is active, and uses open governance.
 * Returns the full joined row so handlers can reuse it without a second query.
 * Throws NotFoundError for nonexistent, inactive, or closed-governance cooperatives.
 */
export async function assertOpenGovernance(
  db: Kysely<Database>,
  cooperativeDid: string,
): Promise<CooperativeRow> {
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

  if (!row || row.governance_visibility !== 'open') {
    throw new NotFoundError('Cooperative not found');
  }

  return row as CooperativeRow;
}
