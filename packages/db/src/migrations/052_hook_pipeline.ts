import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Hook pipeline infrastructure: dead letter queue + pds_record indexes.
 *
 * Part of V7 P6 — unified hook pipeline where pds_record is the source
 * of truth for all firehose events.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Dead letter queue for hook failures ─────────────────────────────

  await db.schema
    .createTable('hook_dead_letter')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('event_uri', 'text', (col) => col.notNull())
    .addColumn('event_did', 'text', (col) => col.notNull())
    .addColumn('collection', 'text', (col) => col.notNull())
    .addColumn('operation', 'text', (col) => col.notNull())
    .addColumn('hook_id', 'text', (col) => col.notNull())
    .addColumn('hook_phase', 'text', (col) => col.notNull())
    .addColumn('error_message', 'text', (col) => col.notNull())
    .addColumn('error_stack', 'text')
    .addColumn('event_data', 'jsonb')
    .addColumn('retry_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('resolved_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  // Index for listing unresolved entries
  await sql`
    CREATE INDEX idx_hook_dead_letter_unresolved
      ON hook_dead_letter (created_at DESC)
      WHERE resolved_at IS NULL
  `.execute(db);

  // ── pds_record indexes for generic record queries ───────────────────

  await sql`
    CREATE INDEX IF NOT EXISTS idx_pds_record_collection_did
      ON pds_record (collection, did)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_pds_record_indexed_at
      ON pds_record (indexed_at DESC)
      WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_pds_record_content_gin
      ON pds_record USING gin (content)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_pds_record_content_gin`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_pds_record_indexed_at`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_pds_record_collection_did`.execute(db);
  await db.schema.dropTable('hook_dead_letter').ifExists().execute();
}
