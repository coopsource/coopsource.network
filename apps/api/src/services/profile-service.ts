import { type Kysely, sql } from 'kysely';
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
/** V8.9 — Public person profile for the explore endpoint. */
export interface ExplorePersonProfile {
  did: string;
  handle: string;
  displayName: string;
  bio: string | null;
  avatarCid: string | null;
  cooperatives: Array<{ handle: string; displayName: string }>;
  interests: string[];
}

export interface DefaultProfile {
  id: string;
  entityDid: string;
  displayName: string;
  avatarCid: string | null;
  bio: string | null;
  verified: boolean;
  discoverable: boolean;
  dismissedGetStarted: boolean;
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
        'discoverable',
        'dismissed_get_started',
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
      discoverable: row.discoverable,
      dismissedGetStarted: row.dismissed_get_started,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * V8.8 — Flip the `discoverable` flag on the user's default profile.
   *
   * Scoped to `is_default = true AND invalidated_at IS NULL` so non-default
   * profiles (once multi-profile lands post-V8.3) are untouched. The partial
   * unique index guarantees at most one row matches per entity.
   *
   * No-op if the entity has no default profile (zero rows updated). The
   * caller (PATCH /api/v1/me/profile) runs behind `requireAuth`, which
   * already enforces an active membership — and AuthService.register
   * creates a default profile for every person — so in practice this will
   * always find a row.
   */
  async setDiscoverable(entityDid: string, discoverable: boolean): Promise<void> {
    await this.db
      .updateTable('profile')
      .set({ discoverable, updated_at: this.clock.now() })
      .where('entity_did', '=', entityDid)
      .where('is_default', '=', true)
      .where('invalidated_at', 'is', null)
      .execute();
  }

  /**
   * V8.9 — Mark the Get Started card as dismissed for the user's default
   * profile. Same scoping and safety model as `setDiscoverable`.
   */
  async setDismissedGetStarted(entityDid: string, dismissed: boolean): Promise<void> {
    await this.db
      .updateTable('profile')
      .set({ dismissed_get_started: dismissed, updated_at: this.clock.now() })
      .where('entity_did', '=', entityDid)
      .where('is_default', '=', true)
      .where('invalidated_at', 'is', null)
      .execute();
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
        'discoverable',
        'dismissed_get_started',
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
      discoverable: row.discoverable,
      dismissedGetStarted: row.dismissed_get_started,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * V8.9 — Public person profile for the explore endpoint.
   *
   * Returns a person's public profile gated by the D1 hybrid discoverability
   * predicate: the person must be active AND either have `discoverable = true`
   * OR have at least one `stakeholder_interest` record (alignment data).
   *
   * Returns null if the person doesn't exist, isn't active, or fails the D1
   * predicate. The route layer maps null to 404.
   */
  async getPublicPersonProfile(handle: string): Promise<ExplorePersonProfile | null> {
    // 1. Fetch entity + profile with D1 hybrid predicate
    const row = await this.db
      .selectFrom('entity')
      .innerJoin('profile', 'profile.entity_did', 'entity.did')
      .where('entity.handle', '=', handle)
      .where('entity.type', '=', 'person')
      .where('entity.status', '=', 'active')
      .where('profile.is_default', '=', true)
      .where('profile.invalidated_at', 'is', null)
      .where((eb) =>
        eb.or([
          eb('profile.discoverable', '=', true),
          eb.exists(
            eb
              .selectFrom('stakeholder_interest')
              .whereRef('stakeholder_interest.did', '=', 'entity.did')
              .select(sql<number>`1`.as('one')),
          ),
        ]),
      )
      .select([
        'entity.did',
        'entity.handle',
        'profile.display_name',
        'profile.bio',
        'profile.avatar_cid',
      ])
      .executeTakeFirst();

    if (!row || !row.handle) return null;

    // 2. Fetch publicly-discoverable cooperatives the person belongs to
    const coopRows = await this.db
      .selectFrom('membership')
      .innerJoin('entity', 'entity.did', 'membership.cooperative_did')
      .innerJoin('cooperative_profile', 'cooperative_profile.entity_did', 'entity.did')
      .where('membership.member_did', '=', row.did)
      .where('membership.status', '=', 'active')
      .where('entity.type', '=', 'cooperative')
      .where('entity.status', '=', 'active')
      .where('cooperative_profile.anon_discoverable', '=', true)
      .where('entity.handle', 'is not', null)
      .select(['entity.handle', 'entity.display_name'])
      .execute();

    const cooperatives = coopRows.map((c) => ({
      handle: c.handle!,
      displayName: c.display_name,
    }));

    // 3. Fetch unique interest categories from stakeholder_interest JSONB
    const interestRows = await sql<{ category: string }>`
      SELECT DISTINCT lower(item->>'category') AS category
      FROM stakeholder_interest si,
           jsonb_array_elements(si.interests) AS item
      WHERE si.did = ${row.did}
        AND item->>'category' IS NOT NULL
      ORDER BY category
    `.execute(this.db);

    const interests = interestRows.rows.map((r) => r.category);

    return {
      did: row.did,
      handle: row.handle,
      displayName: row.display_name,
      bio: row.bio,
      avatarCid: row.avatar_cid,
      cooperatives,
      interests,
    };
  }
}
