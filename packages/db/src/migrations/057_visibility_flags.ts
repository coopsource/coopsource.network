import type { Kysely } from 'kysely';

/**
 * Migration 057 — V8.1 visibility foundation
 *
 * Adds two new visibility flags to cooperative_profile:
 *
 * - anon_discoverable: Whether this coop appears in the public directory and
 *   search results for anonymous users. Default false (opt-in for discoverability).
 *
 * - cross_coop_visible: Whether other cooperatives' members can see this coop's
 *   public profile. Default true (cross-coop sharing is the norm).
 *
 * These flags drive the V8 visibility model. The existing public_* flags continue
 * to control which fields are visible; these new flags control discoverability
 * (whether the coop appears at all, regardless of which fields are shown).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('cooperative_profile')
    .addColumn('anon_discoverable', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn('cross_coop_visible', 'boolean', (col) =>
      col.notNull().defaultTo(true),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('cooperative_profile')
    .dropColumn('anon_discoverable')
    .dropColumn('cross_coop_visible')
    .execute();
}
