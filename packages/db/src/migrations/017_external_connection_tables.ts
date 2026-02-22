import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // External connections (GitHub, Google, etc.)
  await db.schema
    .createTable('external_connection')
    .addColumn('uri', 'text', (col) => col.primaryKey())
    .addColumn('did', 'text', (col) => col.notNull())
    .addColumn('rkey', 'text', (col) => col.notNull())
    .addColumn('service', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
    .addColumn('oauth_token_encrypted', 'text')
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_external_connection_did_service')
    .on('external_connection')
    .columns(['did', 'service'])
    .execute();

  // Connection bindings (link external resources to projects)
  await db.schema
    .createTable('connection_binding')
    .addColumn('uri', 'text', (col) => col.primaryKey())
    .addColumn('did', 'text', (col) => col.notNull())
    .addColumn('rkey', 'text', (col) => col.notNull())
    .addColumn('connection_uri', 'text', (col) => col.notNull())
    .addColumn('project_uri', 'text', (col) => col.notNull())
    .addColumn('resource_type', 'text', (col) => col.notNull())
    .addColumn('resource_id', 'text', (col) => col.notNull())
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_connection_binding_connection')
    .on('connection_binding')
    .columns(['connection_uri'])
    .execute();

  await db.schema
    .createIndex('idx_connection_binding_project')
    .on('connection_binding')
    .columns(['project_uri'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('connection_binding').ifExists().execute();
  await db.schema.dropTable('external_connection').ifExists().execute();
}
