import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 030 — Private record storage + operator audit log
 *
 * 1. private_record: Tier 2 private data (never on ATProto firehose)
 * 2. operator_audit_log: tracks which human operator authorized each cooperative PDS write
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('private_record')
    .addColumn('did', 'text', (col) => col.notNull())
    .addColumn('collection', 'text', (col) => col.notNull())
    .addColumn('rkey', 'text', (col) => col.notNull())
    .addColumn('record', 'jsonb', (col) => col.notNull())
    .addColumn('created_by', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull())
    .addPrimaryKeyConstraint('private_record_pkey', [
      'did',
      'collection',
      'rkey',
    ])
    .execute();

  await db.schema
    .createIndex('idx_private_record_did_collection_created')
    .on('private_record')
    .columns(['did', 'collection', 'created_at'])
    .execute();

  await db.schema
    .createTable('operator_audit_log')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('operator_did', 'text', (col) => col.notNull())
    .addColumn('operation', 'text', (col) => col.notNull())
    .addColumn('collection', 'text', (col) => col.notNull())
    .addColumn('rkey', 'text')
    .addColumn('record_uri', 'text')
    .addColumn('record_cid', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_operator_audit_log_coop_created')
    .on('operator_audit_log')
    .columns(['cooperative_did', 'created_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('operator_audit_log').ifExists().execute();
  await db.schema.dropTable('private_record').ifExists().execute();
}
