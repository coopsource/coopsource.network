import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 060 — V8.7 Match Suggestion table
 *
 * Adds the `match_suggestion` table that backs the V8.7 Match Service. A
 * background job periodically inserts top-N coop suggestions per user;
 * users can dismiss them or mark them as acted-on. Surfaced via the
 * `/me` Home widget and the `/me/matches` page.
 *
 * Schema notes:
 *   - `target_did` (NOT `target_uri`) is the unique key. AT-URIs in this
 *     codebase always include `{collection}/{rkey}` segments — bare
 *     `at://{did}` is not valid and would break existing AT-URI parsers
 *     (see appview/utils.ts, delegation-voting-service.ts, etc.). The
 *     matched coop's identity is its DID; carry only the DID.
 *   - `profile_id` is intentionally absent. The `profile` table
 *     (migration 058) is person-only. Adding a nullable column with no
 *     populator would be dead code; revisit when cooperatives gain
 *     a profile concept (V8.X).
 *   - Migration number 060: ARCHITECTURE-V8.md §V8.7 says 061 but the
 *     actual highest existing migration is 059_search_indexes.ts.
 *
 * Soft-dismiss-as-tombstone:
 *   The unique index `(user_did, target_did)` doubles as a permanent
 *   suppression list. When a user dismisses a match, `dismissed_at` is
 *   set on the row but the row stays. The matchmaking job's candidate
 *   query filters out tombstoned DIDs via a `NOT IN` subquery, so
 *   dismissed coops are never re-suggested as long as the row exists.
 *   `pruneStale` MUST NOT touch dismissed/acted-on rows — only
 *   un-actioned rows older than 14 days are eligible for cleanup.
 *
 * Indexes use raw `sql` template literals because Kysely's schema
 * builder does not support partial indexes (the active-rows hot path)
 * or column-level `DESC` ordering. Mirrors the convention in
 * 058_profile.ts:55-59 and 011_fix_indexes.ts.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('match_suggestion')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('user_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('target_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('match_type', 'text', (col) =>
      col.notNull().defaultTo('cooperative'),
    )
    // numeric(5,4) → values in [0.0000, 9.9999]; we clamp to [0, 1] in the
    // service. Stored as numeric so future scoring can use the precision
    // without a migration.
    .addColumn('score', sql`numeric(5,4)`, (col) => col.notNull())
    // jsonb signals breakdown + scoring algorithm version. Service casts
    // to MatchReason at the boundary; DB type is Record<string, unknown>
    // matching the rest of the schema.
    .addColumn('reason', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('dismissed_at', 'timestamptz')
    .addColumn('acted_on_at', 'timestamptz')
    .execute();

  // Dedupe key + cross-user 404 lookups. Doubles as the tombstone ledger:
  // dismissed/acted rows persist here to block re-suggestion.
  await sql`
    CREATE UNIQUE INDEX uq_match_user_target
      ON match_suggestion (user_did, target_did)
  `.execute(db);

  // List-endpoint hot path: active rows ordered by score desc.
  await sql`
    CREATE INDEX idx_match_user_active_score
      ON match_suggestion (user_did, score DESC)
      WHERE dismissed_at IS NULL AND acted_on_at IS NULL
  `.execute(db);

  // Pruning support: pruneStale() filters by created_at.
  await sql`
    CREATE INDEX idx_match_created_at
      ON match_suggestion (created_at)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('match_suggestion').ifExists().execute();
}
