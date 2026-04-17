import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 058 — V8.3 profile data model
 *
 * Adds the `profile` table that separates "user identity" (DID, owned by
 * `entity`) from "user presentation" (display name, avatar, bio). Each
 * person has exactly one default profile, enforced by a partial unique
 * index. The schema supports multi-profile from day one but V8.3 only
 * ships single-profile-per-user.
 *
 * Backfill: one default profile per active person entity, mirroring
 * `entity.display_name` and `entity.avatar_cid`. The `NOT EXISTS` guard
 * makes the migration safely idempotent if a partial run is replayed.
 *
 * V8.3 design notes:
 * - Person scope only — `entity.type = 'person'` is enforced at the
 *   application layer (no CHECK constraint, kept open for future).
 * - `profile.handle` is intentionally NOT in V8.3 — `entity.handle` is
 *   UNIQUE and routes by handle; uniqueness semantics for profile-level
 *   handles will be defined by V8.X (multi-profile UI phase).
 * - `last_renamed_at` defaults NULL (not NOW()) so V8.X's rate-limited
 *   renames don't accidentally lock out grandfathered users.
 * - All V8.3 default profiles are `verified=true` — single profile per
 *   user trivially satisfies §2.2's "default profile is verified"
 *   invariant. The verification mechanism + `verified_via` distinction
 *   arrive in V8.X.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('profile')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('entity_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('is_default', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('display_name', 'text', (col) => col.notNull())
    .addColumn('avatar_cid', 'text')
    .addColumn('bio', 'text')
    .addColumn('verified', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('last_renamed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('invalidated_at', 'timestamptz')
    .execute();

  // Partial unique index — exactly one active default profile per entity
  await sql`
    CREATE UNIQUE INDEX idx_profile_entity_default
      ON profile (entity_did)
      WHERE is_default = true AND invalidated_at IS NULL
  `.execute(db);

  // Backfill: one default profile per active person entity
  await sql`
    INSERT INTO profile (entity_did, is_default, display_name, avatar_cid, verified)
    SELECT entity.did, true, entity.display_name, entity.avatar_cid, true
    FROM entity
    WHERE entity.type = 'person'
      AND entity.status = 'active'
      AND entity.invalidated_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM profile WHERE profile.entity_did = entity.did)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('profile').ifExists().execute();
}
