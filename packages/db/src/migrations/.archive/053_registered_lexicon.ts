import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Admin-registered lexicons table.
 *
 * Stores lexicon documents registered at runtime via the admin API,
 * along with optional field mappings for declarative hook generation.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('registered_lexicon')
    .addColumn('nsid', 'text', (col) => col.primaryKey())
    .addColumn('lexicon_doc', 'jsonb', (col) => col.notNull())
    .addColumn('field_mappings', 'jsonb')
    .addColumn('registered_by', 'text', (col) => col.notNull())
    .addColumn('enabled', 'boolean', (col) => col.defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('registered_lexicon').ifExists().execute();
}
