import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // entity — persons and cooperatives
  await db.schema
    .createTable('entity')
    .addColumn('did', 'text', (col) => col.primaryKey())
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('handle', 'text', (col) => col.unique())
    .addColumn('display_name', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('description', 'text')
    .addColumn('avatar_cid', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('created_by', 'text')
    .addColumn('invalidated_at', 'timestamptz')
    .addColumn('invalidated_by', 'text')
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`
    ALTER TABLE entity
      ADD CONSTRAINT entity_type_check
      CHECK (type IN ('person', 'cooperative'));
  `.execute(db);

  await sql`
    ALTER TABLE entity
      ADD CONSTRAINT entity_status_check
      CHECK (status IN ('active', 'suspended', 'deleted'));
  `.execute(db);

  // cooperative_profile — additional data for cooperative entities
  await db.schema
    .createTable('cooperative_profile')
    .addColumn('entity_did', 'text', (col) =>
      col.primaryKey().references('entity.did'),
    )
    .addColumn('uri', 'text', (col) => col.unique())
    .addColumn('cid', 'text')
    .addColumn('cooperative_type', 'text', (col) =>
      col.notNull().defaultTo('other'),
    )
    .addColumn('is_network', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn('membership_policy', 'text', (col) =>
      col.notNull().defaultTo('invite_only'),
    )
    .addColumn('max_members', 'integer')
    .addColumn('location', 'text')
    .addColumn('website', 'text')
    .addColumn('founded_date', 'date')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('cooperative_profile').execute();
  await db.schema.dropTable('entity').execute();
}
