import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 023 — Federation outbox
 *
 * Reliable delivery queue for outbound federation messages.
 * Messages are enqueued with a target DID/URL and payload, then
 * processed asynchronously with exponential backoff on failure.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('federation_outbox')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('target_did', 'text', (col) => col.notNull())
    .addColumn('target_url', 'text', (col) => col.notNull())
    .addColumn('endpoint', 'text', (col) => col.notNull())
    .addColumn('method', 'text', (col) => col.notNull().defaultTo('POST'))
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('idempotency_key', 'text', (col) => col.unique())
    .addColumn('status', 'text', (col) =>
      col
        .notNull()
        .defaultTo('pending')
        .check(
          sql`status IN ('pending', 'sending', 'sent', 'failed', 'dead')`,
        ),
    )
    .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('max_attempts', 'integer', (col) => col.notNull().defaultTo(5))
    .addColumn('next_attempt_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('last_error', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('sent_at', 'timestamptz')
    .addColumn('completed_at', 'timestamptz')
    .execute();

  // For polling pending/failed messages due for delivery
  await sql`
    CREATE INDEX idx_federation_outbox_pending
    ON federation_outbox(status, next_attempt_at)
    WHERE status IN ('pending', 'failed')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('federation_outbox').ifExists().execute();
}
