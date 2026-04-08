import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 059 — V8.6 search indexes (Postgres FTS)
 *
 * Adds generated `tsvector` columns + GIN indexes for full-text search over:
 *   - `entity` (display_name + handle weight A, description weight B)
 *   - `post`   (body)
 *
 * The new tsvector columns are intentionally NOT added to `EntityTable` /
 * `PostTable` interfaces in `schema.ts` — they are never SELECTed as columns,
 * only used inside `WHERE` predicates via `sql\`...\`` raw expressions. Keeping
 * them out of the typed interface avoids polluting all selects and JSON
 * serialization paths with a tsvector field.
 *
 * `setweight()` is used so a future `ts_rank_cd`-based ordering can prefer
 * name/handle matches over description matches without another schema change.
 * Cost is zero at write time (only matters when `ts_rank` is called).
 *
 * IMPORTANT — production safety:
 *   The `ALTER TABLE entity ADD COLUMN ... GENERATED ALWAYS AS ... STORED`
 *   statement rewrites the table and takes an ACCESS EXCLUSIVE lock. The
 *   `entity` table is the central FK target (every other table FKs to it),
 *   so this lock blocks all in-flight queries against the database.
 *
 *   For dev/staging this is sub-second. THIS MIGRATION IS NOT SAFE TO RUN
 *   ONLINE AGAINST A POPULATED PRODUCTION DB WITHOUT A MAINTENANCE WINDOW.
 *   See docs/operations.md for the runbook entry.
 *
 *   Future migrations against larger tables should split into:
 *     (a) add nullable column,
 *     (b) backfill in batches,
 *     (c) add `NOT NULL` + `CREATE INDEX CONCURRENTLY`.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // Cooperative search: weight name + handle as 'A', description as 'B'.
  await sql`
    ALTER TABLE entity
      ADD COLUMN entity_search_tsv tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(display_name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(handle, '')),       'A') ||
        setweight(to_tsvector('english', coalesce(description, '')),  'B')
      ) STORED
  `.execute(db);

  await sql`
    CREATE INDEX idx_entity_search_tsv ON entity USING GIN (entity_search_tsv)
  `.execute(db);

  // Post search: body only (posts have no title field).
  await sql`
    ALTER TABLE post
      ADD COLUMN post_search_tsv tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED
  `.execute(db);

  await sql`
    CREATE INDEX idx_post_search_tsv ON post USING GIN (post_search_tsv)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_post_search_tsv`.execute(db);
  await sql`ALTER TABLE post DROP COLUMN IF EXISTS post_search_tsv`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_entity_search_tsv`.execute(db);
  await sql`ALTER TABLE entity DROP COLUMN IF EXISTS entity_search_tsv`.execute(db);
}
