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
      },
    };
  }

  async updateCooperative(
    did: string,
    updates: {
      displayName?: string;
      description?: string;
      website?: string;
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

    if (updates.website) {
      await this.db
        .updateTable('cooperative_profile')
        .set({ website: updates.website, indexed_at: new Date() })
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
