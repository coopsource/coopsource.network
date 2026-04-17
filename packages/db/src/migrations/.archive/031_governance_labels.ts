import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 031 — Governance labels
 *
 * ATProto-style labels for governance status tracking.
 * Used by the governance labeler service to emit labels on
 * proposal status transitions, membership changes, etc.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('governance_label')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('src_did', 'text', (col) => col.notNull())
    .addColumn('subject_uri', 'text', (col) => col.notNull())
    .addColumn('subject_cid', 'text')
    .addColumn('label_value', 'text', (col) => col.notNull())
    .addColumn('neg', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_governance_label_subject')
    .on('governance_label')
    .column('subject_uri')
    .execute();

  await db.schema
    .createIndex('idx_governance_label_value')
    .on('governance_label')
    .column('label_value')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('governance_label').execute();
}
