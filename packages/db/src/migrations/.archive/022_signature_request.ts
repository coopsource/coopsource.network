import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 022 — Signature request tracking
 *
 * Tracks cross-instance agreement signature requests through their lifecycle:
 * pending → signed | rejected | cancelled | expired | retracted
 *
 * A partial unique index ensures only one pending request per agreement+signer
 * at a time, while allowing re-requests after resolution.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('signature_request')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('agreement_uri', 'text', (col) => col.notNull())
    .addColumn('agreement_title', 'text')
    .addColumn('signer_did', 'text', (col) => col.notNull())
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('requester_did', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) =>
      col
        .notNull()
        .defaultTo('pending')
        .check(
          sql`status IN ('pending', 'signed', 'rejected', 'cancelled', 'expired', 'retracted')`,
        ),
    )
    .addColumn('requested_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('responded_at', 'timestamptz')
    .addColumn('expires_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now() + interval '30 days'`),
    )
    .addColumn('response_message', 'text')
    .addColumn('signature_uri', 'text')
    .addColumn('signature_cid', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Partial unique: only one PENDING request per agreement+signer at a time
  await sql`
    CREATE UNIQUE INDEX idx_signature_request_pending_unique
    ON signature_request(agreement_uri, signer_did)
    WHERE status = 'pending'
  `.execute(db);

  // For expiry cleanup queries
  await sql`
    CREATE INDEX idx_signature_request_pending
    ON signature_request(status, expires_at)
    WHERE status = 'pending'
  `.execute(db);

  // For looking up requests by agreement
  await db.schema
    .createIndex('idx_signature_request_agreement')
    .on('signature_request')
    .columns(['agreement_uri'])
    .execute();

  // For GET /me/signature-requests (signer's pending requests)
  await db.schema
    .createIndex('idx_signature_request_signer')
    .on('signature_request')
    .columns(['signer_did', 'status'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('signature_request').ifExists().execute();
}
