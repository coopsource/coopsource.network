import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IBlobStore } from '@coopsource/federation';
import { NotFoundError } from '@coopsource/common';

export class EntityService {
  constructor(
    private db: Kysely<Database>,
    private blobStore: IBlobStore,
  ) {}

  async getCooperative(): Promise<{
    entity: {
      did: string;
      type: string;
      display_name: string;
      description: string | null;
      avatar_cid: string | null;
      status: string;
    };
    profile: {
      cooperative_type: string;
      membership_policy: string;
      max_members: number | null;
      location: string | null;
      website: string | null;
      founded_date: string | null;
      public_description: boolean;
      public_members: boolean;
      public_activity: boolean;
      public_agreements: boolean;
      public_campaigns: boolean;
    };
  } | null> {
    const row = await this.db
      .selectFrom('entity')
      .innerJoin(
        'cooperative_profile',
        'cooperative_profile.entity_did',
        'entity.did',
      )
      .where('entity.type', '=', 'cooperative')
      .where('entity.status', '=', 'active')
      .select([
        'entity.did',
        'entity.type',
        'entity.display_name',
        'entity.description',
        'entity.avatar_cid',
        'entity.status',
        'cooperative_profile.cooperative_type',
        'cooperative_profile.membership_policy',
        'cooperative_profile.max_members',
        'cooperative_profile.location',
        'cooperative_profile.website',
        'cooperative_profile.founded_date',
        'cooperative_profile.public_description',
        'cooperative_profile.public_members',
        'cooperative_profile.public_activity',
        'cooperative_profile.public_agreements',
        'cooperative_profile.public_campaigns',
      ])
      .executeTakeFirst();

    if (!row) return null;

    return {
      entity: {
        did: row.did,
        type: row.type,
        display_name: row.display_name,
        description: row.description,
        avatar_cid: row.avatar_cid,
        status: row.status,
      },
      profile: {
        cooperative_type: row.cooperative_type,
        membership_policy: row.membership_policy,
        max_members: row.max_members,
        location: row.location,
        website: row.website,
        founded_date: row.founded_date,
        public_description: row.public_description,
        public_members: row.public_members,
        public_activity: row.public_activity,
        public_agreements: row.public_agreements,
        public_campaigns: row.public_campaigns,
      },
    };
  }

  async getCooperativeByHandle(handle: string): Promise<{
    entity: {
      did: string;
      type: string;
      handle: string | null;
      display_name: string;
      description: string | null;
      avatar_cid: string | null;
      status: string;
    };
    profile: {
      cooperative_type: string;
      membership_policy: string;
      max_members: number | null;
      location: string | null;
      website: string | null;
      founded_date: string | null;
      is_network: boolean;
      public_description: boolean;
      public_members: boolean;
      public_activity: boolean;
      public_agreements: boolean;
      public_campaigns: boolean;
    };
  } | null> {
    const row = await this.db
      .selectFrom('entity')
      .innerJoin(
        'cooperative_profile',
        'cooperative_profile.entity_did',
        'entity.did',
      )
      .where('entity.type', '=', 'cooperative')
      .where('entity.status', '=', 'active')
      .where('entity.handle', '=', handle)
      .select([
        'entity.did',
        'entity.type',
        'entity.handle',
        'entity.display_name',
        'entity.description',
        'entity.avatar_cid',
        'entity.status',
        'cooperative_profile.cooperative_type',
        'cooperative_profile.membership_policy',
        'cooperative_profile.max_members',
        'cooperative_profile.location',
        'cooperative_profile.website',
        'cooperative_profile.founded_date',
        'cooperative_profile.is_network',
        'cooperative_profile.public_description',
        'cooperative_profile.public_members',
        'cooperative_profile.public_activity',
        'cooperative_profile.public_agreements',
        'cooperative_profile.public_campaigns',
      ])
      .executeTakeFirst();

    if (!row) return null;

    return {
      entity: {
        did: row.did,
        type: row.type,
        handle: row.handle,
        display_name: row.display_name,
        description: row.description,
        avatar_cid: row.avatar_cid,
        status: row.status,
      },
      profile: {
        cooperative_type: row.cooperative_type,
        membership_policy: row.membership_policy,
        max_members: row.max_members,
        location: row.location,
        website: row.website,
        founded_date: row.founded_date,
        is_network: row.is_network,
        public_description: row.public_description,
        public_members: row.public_members,
        public_activity: row.public_activity,
        public_agreements: row.public_agreements,
        public_campaigns: row.public_campaigns,
      },
    };
  }

  async updateCooperative(
    did: string,
    updates: {
      displayName?: string;
      description?: string;
      website?: string;
      publicDescription?: boolean;
      publicMembers?: boolean;
      publicActivity?: boolean;
      publicAgreements?: boolean;
      publicCampaigns?: boolean;
    },
  ): Promise<void> {
    const entity = await this.db
      .selectFrom('entity')
      .where('did', '=', did)
      .where('type', '=', 'cooperative')
      .select('did')
      .executeTakeFirst();

    if (!entity) throw new NotFoundError('Cooperative not found');

    if (updates.displayName || updates.description) {
      await this.db
        .updateTable('entity')
        .set({
          ...(updates.displayName
            ? { display_name: updates.displayName }
            : {}),
          ...(updates.description
            ? { description: updates.description }
            : {}),
          indexed_at: new Date(),
        })
        .where('did', '=', did)
        .execute();
    }

    const profileUpdates: Record<string, unknown> = {};
    if (updates.website) profileUpdates.website = updates.website;
    if (updates.publicDescription !== undefined) profileUpdates.public_description = updates.publicDescription;
    if (updates.publicMembers !== undefined) profileUpdates.public_members = updates.publicMembers;
    if (updates.publicActivity !== undefined) profileUpdates.public_activity = updates.publicActivity;
    if (updates.publicAgreements !== undefined) profileUpdates.public_agreements = updates.publicAgreements;
    if (updates.publicCampaigns !== undefined) profileUpdates.public_campaigns = updates.publicCampaigns;

    if (Object.keys(profileUpdates).length > 0) {
      profileUpdates.indexed_at = new Date();
      await this.db
        .updateTable('cooperative_profile')
        .set(profileUpdates)
        .where('entity_did', '=', did)
        .execute();
    }
  }

  async uploadAvatar(
    entityDid: string,
    data: Buffer,
    mimeType: string,
  ): Promise<string> {
    const blobRef = await this.blobStore.upload(data, mimeType);
    const cid = blobRef.ref.$link;

    await this.db
      .updateTable('entity')
      .set({ avatar_cid: cid, indexed_at: new Date() })
      .where('did', '=', entityDid)
      .execute();

    return cid;
  }
}
