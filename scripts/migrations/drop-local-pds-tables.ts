/**
 * Migration 052: Drop V3-era local PDS tables.
 *
 * These tables were used by LocalPdsService to simulate an ATProto PDS
 * in PostgreSQL. With the V6 federation migration, records are stored in
 * a real @atproto/pds instance and indexed via the firehose (relay or Tap).
 *
 * IMPORTANT: Only run this migration after verifying that:
 * 1. The firehose consumer (RELAY_URL or TAP_URL) is stable in production
 * 2. All data has been re-indexed from the real PDS
 * 3. LocalPdsService is no longer in use (PDS_URL is configured)
 *
 * Tables dropped:
 * - pds_record: Stored ATProto-shaped records locally
 * - pds_commit: Commit log for firehose replay/sequencing
 * - federation_peer: Tracked registered cooperative instances
 * - federation_outbox: Queue for outbound federation messages
 * - plc_operation: Stored local did:plc genesis operations
 *
 * Tables KEPT:
 * - pds_firehose_cursor: Still used by relay/Tap consumers for cursor tracking
 * - entity_key: Still used for signing key storage
 * - private_record: Tier 2 data (never was in PDS)
 * - operator_audit_log: Audit trail (never was in PDS)
 */

import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('federation_outbox').ifExists().execute();
  await db.schema.dropTable('federation_peer').ifExists().execute();
  await db.schema.dropTable('pds_commit').ifExists().execute();
  await db.schema.dropTable('pds_record').ifExists().execute();
  await db.schema.dropTable('plc_operation').ifExists().execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Re-create tables in reverse order for rollback.
  // These are minimal schemas — a full rollback would need LocalPdsService data restoration.

  await db.schema
    .createTable('plc_operation')
    .ifNotExists()
    .addColumn('did', 'text', (col) => col.primaryKey())
    .addColumn('genesis_op', 'jsonb', (col) => col.notNull())
    .addColumn('did_document', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('pds_record')
    .ifNotExists()
    .addColumn('uri', 'text', (col) => col.primaryKey())
    .addColumn('did', 'text', (col) => col.notNull())
    .addColumn('collection', 'text', (col) => col.notNull())
    .addColumn('rkey', 'text', (col) => col.notNull())
    .addColumn('cid', 'text', (col) => col.notNull())
    .addColumn('content', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .addColumn('deleted_at', 'timestamptz')
    .addColumn('indexed_at', 'timestamptz', (col) => col.notNull())
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

  await db.schema
    .createTable('federation_peer')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('did', 'text', (col) => col.notNull().unique())
    .addColumn('pds_url', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
    .addColumn('registered_at', 'timestamptz', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('federation_outbox')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('target_did', 'text')
    .addColumn('target_url', 'text', (col) => col.notNull())
    .addColumn('endpoint', 'text', (col) => col.notNull())
    .addColumn('method', 'text', (col) => col.notNull().defaultTo('POST'))
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('max_attempts', 'integer', (col) => col.notNull().defaultTo(5))
    .addColumn('next_attempt_at', 'timestamptz')
    .addColumn('sent_at', 'timestamptz')
    .addColumn('completed_at', 'timestamptz')
    .addColumn('last_error', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .execute();
}
