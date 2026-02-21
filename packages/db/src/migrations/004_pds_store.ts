import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // pds_record — local PDS record store (Stage 0-1 only)
  await db.schema
    .createTable('pds_record')
    .addColumn('uri', 'text', (col) => col.primaryKey())
    .addColumn('did', 'text', (col) => col.notNull().references('entity.did'))
    .addColumn('collection', 'text', (col) => col.notNull())
    .addColumn('rkey', 'text', (col) => col.notNull())
    .addColumn('cid', 'text', (col) => col.notNull())
    .addColumn('content', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('deleted_at', 'timestamptz')
    .execute();

  await sql`
    ALTER TABLE pds_record
      ADD CONSTRAINT pds_record_did_collection_rkey_unique
      UNIQUE (did, collection, rkey);
  `.execute(db);

  // pds_commit — commit log for firehose replay
  await db.schema
    .createTable('pds_commit')
    .addColumn('global_seq', 'bigserial', (col) => col.primaryKey())
    .addColumn('local_seq', 'bigint', (col) => col.notNull())
    .addColumn('did', 'text', (col) => col.notNull().references('entity.did'))
    .addColumn('commit_cid', 'text', (col) => col.notNull())
    .addColumn('record_uri', 'text', (col) => col.notNull())
    .addColumn('record_cid', 'text', (col) => col.notNull())
    .addColumn('operation', 'text', (col) => col.notNull())
    .addColumn('prev_record_cid', 'text')
    .addColumn('committed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`
    ALTER TABLE pds_commit
      ADD CONSTRAINT pds_commit_operation_check
      CHECK (operation IN ('create', 'update', 'delete'));
  `.execute(db);

  await sql`
    ALTER TABLE pds_commit
      ADD CONSTRAINT pds_commit_did_local_seq_unique
      UNIQUE (did, local_seq);
  `.execute(db);

  // pds_firehose_cursor — tracks subscriber position in the commit stream
  await db.schema
    .createTable('pds_firehose_cursor')
    .addColumn('subscriber_id', 'text', (col) => col.primaryKey())
    .addColumn('last_global_seq', 'bigint', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('pds_firehose_cursor').execute();
  await db.schema.dropTable('pds_commit').execute();
  await db.schema.dropTable('pds_record').execute();
}
