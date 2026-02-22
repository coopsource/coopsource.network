import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // OAuth state store — CSRF state for ATProto OAuth flows
  await db.schema
    .createTable('oauth_state')
    .addColumn('key', 'text', (col) => col.primaryKey())
    .addColumn('state', 'jsonb', (col) => col.notNull())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // OAuth session store — token storage for ATProto OAuth sessions
  await db.schema
    .createTable('oauth_session')
    .addColumn('did', 'text', (col) => col.primaryKey())
    .addColumn('token_set', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Index for cleaning up expired state entries
  await db.schema
    .createIndex('idx_oauth_state_expires_at')
    .on('oauth_state')
    .column('expires_at')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('oauth_session').ifExists().execute();
  await db.schema.dropTable('oauth_state').ifExists().execute();
}
