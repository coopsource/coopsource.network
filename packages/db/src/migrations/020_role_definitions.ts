import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 020 — Role definitions
 *
 * Stores per-cooperative role definitions with granular permissions
 * and inheritance chains. Built-in roles (member, coordinator, admin,
 * observer) are seeded during cooperative setup.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('role_definition')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('permissions', sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'`),
    )
    .addColumn('inherits', sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'`),
    )
    .addColumn('is_builtin', 'boolean', (col) => col.defaultTo(false))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('uq_role_definition_coop_name', [
      'cooperative_did',
      'name',
    ])
    .execute();

  await db.schema
    .createIndex('idx_role_definition_coop')
    .on('role_definition')
    .columns(['cooperative_did'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('role_definition').ifExists().execute();
}
