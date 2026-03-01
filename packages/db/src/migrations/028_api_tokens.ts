import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 028 — API tokens
 *
 * Bearer tokens for MCP server and programmatic API access.
 * Tokens are scoped to a cooperative and user, with optional expiry.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('api_token')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('user_did', 'text', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('token_hash', 'text', (col) => col.notNull().unique())
    .addColumn('scopes', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'["read"]'::jsonb`),
    )
    .addColumn('last_used_at', 'timestamptz')
    .addColumn('expires_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // token_hash already has a unique constraint which creates an implicit index

  await db.schema
    .createIndex('idx_api_token_coop_user')
    .on('api_token')
    .columns(['cooperative_did', 'user_did'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('api_token').execute();
}
