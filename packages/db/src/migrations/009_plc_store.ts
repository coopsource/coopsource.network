import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Local PLC directory storage.
 *
 * In Stage 0-1 we run without an external PLC directory service.
 * LocalPlcClient computes proper did:plc: identifiers from genesis operations
 * and stores them here. The DID document is served by our own API.
 *
 * In Stage 2+ this table is unused once we switch to a real @atproto/pds
 * instance with plc.directory.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('plc_operation')
    .addColumn('did',         'text',        col => col.primaryKey())
    .addColumn('genesis_op',  'jsonb',       col => col.notNull())
    .addColumn('did_document','jsonb',       col => col.notNull())
    .addColumn('created_at',  'timestamptz', col => col.notNull().defaultTo(sql`NOW()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('plc_operation').ifExists().execute();
}
