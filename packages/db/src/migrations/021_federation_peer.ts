import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 021 — Federation peer registry
 *
 * Tracks cooperative instances that have registered with this hub.
 * Used by hub/standalone instances to maintain a directory of known peers.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('federation_peer')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('did', 'text', (col) => col.notNull().unique())
    .addColumn('display_name', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('cooperative_type', 'text')
    .addColumn('website', 'text')
    .addColumn('pds_url', 'text', (col) => col.notNull())
    .addColumn('registered_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('last_seen_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('status', 'text', (col) =>
      col
        .notNull()
        .defaultTo('active')
        .check(sql`status IN ('active', 'suspended', 'removed')`),
    )
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_federation_peer_status')
    .on('federation_peer')
    .columns(['status'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('federation_peer').ifExists().execute();
}
