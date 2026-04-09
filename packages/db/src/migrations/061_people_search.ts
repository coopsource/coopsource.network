import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 061 — V8.8 People Search + Alignment Matchmaking
 *
 * Adds the schema foundation for V8.8:
 *   1. `profile.discoverable`            — opt-in person discoverability flag
 *      (D1 hybrid: surface a person via this flag OR because they have
 *      alignment data, e.g., a stakeholder_interest record).
 *   2. `profile.profile_bio_tsv`         — generated tsvector + GIN index for
 *      person-bio FTS. Distinct from V8.6's `entity_search_tsv` which lives
 *      on the `entity` table and indexes display_name/handle/description.
 *   3. `idx_profile_discoverable`        — partial index supporting the
 *      `discoverable = true OR EXISTS (alignment data)` predicate hot path.
 *   4. `desired_outcome.outcome_search_tsv` — generated tsvector + GIN index
 *      for searchAlignment (title/category weight A, description weight B).
 *   5. `idx_stakeholder_interest_interests_gin` — JSONB GIN index using
 *      `jsonb_path_ops` (smaller, faster, supports `@>` containment which is
 *      exactly what the matchmaking interest aggregation uses).
 *
 * Naming note:
 *   ARCHITECTURE-V8.md §V8.8 calls this 062, but the repo's existing
 *   convention is contiguous numbering (the latest applied is 060). We use
 *   061 to keep the sequence intact.
 *
 * Convention: like V8.6 (migration 059), the new tsvector columns are NOT
 * added to `ProfileTable` / `DesiredOutcomeTable` interfaces in `schema.ts`
 * — they are never SELECTed as columns, only used inside `WHERE` predicates
 * via raw `sql\`...\`` expressions. Keeping them out of the typed interface
 * avoids polluting all selects and JSON serialization paths.
 *
 * IMPORTANT — production safety:
 *   The `ALTER TABLE ... ADD COLUMN ... GENERATED ALWAYS AS ... STORED`
 *   statements rewrite the affected table and take ACCESS EXCLUSIVE locks.
 *   This blocks all in-flight queries against the tables for the duration.
 *
 *   Compared to migration 059 (which altered `entity`, the central FK target
 *   for every other table in the schema), the locks here are SUBSTANTIALLY
 *   smaller because:
 *     - `profile` has no inbound foreign keys from other tables.
 *     - `desired_outcome` has only a handful of inbound references via
 *       alignment-feature tables.
 *     - `stakeholder_interest` is only getting an index (no table rewrite).
 *
 *   For dev/staging this is sub-second. THIS MIGRATION IS STILL NOT SAFE TO
 *   RUN ONLINE AGAINST A POPULATED PRODUCTION DB WITHOUT A MAINTENANCE
 *   WINDOW. See docs/operations.md for the runbook entry.
 *
 *   Future migrations against larger tables should split into:
 *     (a) add nullable column,
 *     (b) backfill in batches,
 *     (c) add `NOT NULL` + `CREATE INDEX CONCURRENTLY`.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Person discoverability flag (D1 hybrid: this OR has alignment data).
  await sql`
    ALTER TABLE profile
      ADD COLUMN discoverable BOOLEAN NOT NULL DEFAULT false
  `.execute(db);

  // 2. Person bio FTS — separate from entity_search_tsv (which V8.6 added).
  await sql`
    ALTER TABLE profile
      ADD COLUMN profile_bio_tsv tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(bio, ''))) STORED
  `.execute(db);

  await sql`
    CREATE INDEX idx_profile_bio_tsv ON profile USING GIN (profile_bio_tsv)
  `.execute(db);

  // 3. Partial index supporting the discoverability OR-EXISTS predicate.
  await sql`
    CREATE INDEX idx_profile_discoverable
      ON profile (entity_did)
      WHERE discoverable = true
  `.execute(db);

  // 4. Outcome FTS for searchAlignment.
  await sql`
    ALTER TABLE desired_outcome
      ADD COLUMN outcome_search_tsv tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')),       'A') ||
        setweight(to_tsvector('english', coalesce(category, '')),    'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
      ) STORED
  `.execute(db);

  await sql`
    CREATE INDEX idx_desired_outcome_search_tsv
      ON desired_outcome USING GIN (outcome_search_tsv)
  `.execute(db);

  // 5. JSONB GIN on stakeholder_interest.interests for the @> containment
  //    used by the matchmaking interest aggregation. jsonb_path_ops is
  //    smaller and faster but only supports @>, which is exactly what we use.
  await sql`
    CREATE INDEX idx_stakeholder_interest_interests_gin
      ON stakeholder_interest USING GIN (interests jsonb_path_ops)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Reverse order: drop indexes first, then columns.
  await sql`DROP INDEX IF EXISTS idx_stakeholder_interest_interests_gin`.execute(db);

  await sql`DROP INDEX IF EXISTS idx_desired_outcome_search_tsv`.execute(db);
  await sql`ALTER TABLE desired_outcome DROP COLUMN IF EXISTS outcome_search_tsv`.execute(db);

  await sql`DROP INDEX IF EXISTS idx_profile_discoverable`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_profile_bio_tsv`.execute(db);
  await sql`ALTER TABLE profile DROP COLUMN IF EXISTS profile_bio_tsv`.execute(db);
  await sql`ALTER TABLE profile DROP COLUMN IF EXISTS discoverable`.execute(db);
}
