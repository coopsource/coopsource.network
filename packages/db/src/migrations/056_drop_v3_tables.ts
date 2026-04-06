import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Drop dead V3-era tables that are no longer used.
 *
 * - pds_commit: Local commit sequencing (replaced by Tap cursor management)
 * - federation_peer: Manual cooperative registration (replaced by ATProto relay)
 * - federation_outbox: Outbound message queue (replaced by ATProto firehose)
 * - plc_operation: Local PLC genesis ops (replaced by real plc.directory)
 *
 * Tables KEPT:
 * - pds_record: Source of truth for V7 hook pipeline (P6)
 * - pds_firehose_cursor: Still used by Tap/relay consumers
 *
 * NOTE: After this migration, LocalPdsService and LocalPlcClient (dev-only
 * fallbacks) gracefully handle missing tables via try-catch (Task 9).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('federation_outbox').ifExists().execute();
  await db.schema.dropTable('federation_peer').ifExists().execute();
  await db.schema.dropTable('pds_commit').ifExists().execute();
  await db.schema.dropTable('plc_operation').ifExists().execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('plc_operation')
    .ifNotExists()
    .addColumn('did', 'text', (col) => col.primaryKey())
    .addColumn('genesis_op', 'jsonb', (col) => col.notNull())
    .addColumn('did_document', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('pds_commit')
    .ifNotExists()
    .addColumn('global_seq', 'bigserial', (col) => col.primaryKey())
    .addColumn('local_seq', 'integer', (col) => col.notNull())
    .addColumn('did', 'text', (col) => col.notNull())
    .addColumn('commit_cid', 'text')
    .addColumn('record_uri', 'text', (col) => col.notNull())
    .addColumn('record_cid', 'text', (col) => col.notNull())
    .addColumn('operation', 'text', (col) => col.notNull())
    .addColumn('prev_record_cid', 'text')
    .addColumn('committed_at', 'timestamptz', (col) => col.notNull())
    .execute();

  await sql`
    CREATE TABLE IF NOT EXISTS federation_peer (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      did text NOT NULL UNIQUE,
      display_name text NOT NULL,
      description text,
      cooperative_type text,
      website text,
      pds_url text NOT NULL,
      registered_at timestamptz NOT NULL,
      last_seen_at timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'active',
      metadata jsonb,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS federation_outbox (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      target_did text,
      target_url text NOT NULL,
      endpoint text NOT NULL,
      method text NOT NULL DEFAULT 'POST',
      payload jsonb NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      attempts integer NOT NULL DEFAULT 0,
      max_attempts integer NOT NULL DEFAULT 5,
      next_attempt_at timestamptz,
      sent_at timestamptz,
      completed_at timestamptz,
      last_error text,
      created_at timestamptz NOT NULL
    )
  `.execute(db);
}
