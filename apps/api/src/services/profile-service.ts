import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IClock } from '@coopsource/federation';

/**
 * V8.3 — Profile data layer.
 *
 * Separates user identity (DID, owned by `entity`) from user presentation
 * (display name, avatar, bio). Each person has exactly one default profile,
 * enforced by a partial unique index on the `profile` table.
 *
 * V8.3 ships single-profile-per-user only. Multi-profile creation,
 * activation, and rate-limited renames are deferred to V8.X.
 *
 * Person scope only — `entity.type = 'person'` is enforced at the caller
 * (the only V8.3 caller is `AuthService.register()`).
 */
export interface DefaultProfile {
  id: string;
  entityDid: string;
  displayName: string;
  avatarCid: string | null;
  bio: string | null;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class ProfileService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  /** Look up a person's default profile. Returns null if none exists. */
  async getDefaultProfile(entityDid: string): Promise<DefaultProfile | null> {
    const row = await this.db
      .selectFrom('profile')
      .where('entity_did', '=', entityDid)
      .where('is_default', '=', true)
      .where('invalidated_at', 'is', null)
      .select([
        'id',
        'entity_did',
        'display_name',
        'avatar_cid',
        'bio',
        'verified',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      entityDid: row.entity_did,
      displayName: row.display_name,
      avatarCid: row.avatar_cid,
      bio: row.bio,
      verified: row.verified,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Create a default profile for a freshly-registered person. Caller must
   * ensure the entity row exists. Throws (via the partial unique index) if
   * a default already exists for this entity.
   *
   * The optional `db` override lets a transactional caller (e.g.,
   * `AuthService.register()` running inside `db.transaction()`) participate
   * in the same transaction so the entity insert and profile insert roll
   * back atomically.
   *
   * V8.3 always creates `verified=true` profiles since each user has
   * exactly one default profile carrying their canonical identity.
   */
  async createDefaultProfile(params: {
    entityDid: string;
    displayName: string;
    avatarCid?: string | null;
    db?: Kysely<Database>;
  }): Promise<DefaultProfile> {
    const db = params.db ?? this.db;
    const now = this.clock.now();

    const row = await db
      .insertInto('profile')
      .values({
        entity_did: params.entityDid,
        is_default: true,
        display_name: params.displayName,
        avatar_cid: params.avatarCid ?? null,
        verified: true,
        created_at: now,
        updated_at: now,
      })
      .returning([
        'id',
        'entity_did',
        'display_name',
        'avatar_cid',
        'bio',
        'verified',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      entityDid: row.entity_did,
      displayName: row.display_name,
      avatarCid: row.avatar_cid,
      bio: row.bio,
      verified: row.verified,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
