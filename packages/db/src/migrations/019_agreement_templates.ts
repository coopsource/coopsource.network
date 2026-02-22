import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 019 — Agreement templates
 *
 * Local-only reusable templates that pre-fill agreement creation forms.
 * Templates are always mutable (no status lifecycle).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('agreement_template')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('created_by', 'text', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('agreement_type', 'text', (col) =>
      col.notNull().defaultTo('custom'),
    )
    .addColumn('template_data', 'jsonb', (col) =>
      col.notNull().defaultTo('{}'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_agreement_template_cooperative_did')
    .on('agreement_template')
    .columns(['cooperative_did'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('agreement_template').ifExists().execute();
}
