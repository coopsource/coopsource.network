import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 025 — Payment provider abstraction
 *
 * 1. Rename stripe-specific column to provider-agnostic name
 * 2. Add payment_provider column to funding_pledge
 * 3. Create payment_provider_config table for per-co-op provider settings
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // Rename stripe_checkout_session_id → payment_session_id
  await db.schema
    .alterTable('funding_pledge')
    .renameColumn('stripe_checkout_session_id', 'payment_session_id')
    .execute();

  // Add payment_provider column (null = no provider / offline)
  await db.schema
    .alterTable('funding_pledge')
    .addColumn('payment_provider', 'text')
    .execute();

  // Rebuild index with new column name
  await db.schema.dropIndex('idx_funding_pledge_stripe_session').execute();
  await db.schema
    .createIndex('idx_funding_pledge_payment_session')
    .on('funding_pledge')
    .column('payment_session_id')
    .execute();

  // Per-cooperative payment provider configuration
  await db.schema
    .createTable('payment_provider_config')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('provider_id', 'text', (col) => col.notNull())
    .addColumn('display_name', 'text', (col) => col.notNull())
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('credentials_enc', 'text', (col) => col.notNull())
    .addColumn('webhook_secret_enc', 'text')
    .addColumn('config', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('uq_ppc_coop_provider', [
      'cooperative_did',
      'provider_id',
    ])
    .execute();

  await db.schema
    .createIndex('idx_ppc_cooperative')
    .on('payment_provider_config')
    .column('cooperative_did')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('payment_provider_config').execute();

  await db.schema.dropIndex('idx_funding_pledge_payment_session').execute();
  await db.schema
    .createIndex('idx_funding_pledge_stripe_session')
    .on('funding_pledge')
    .column('payment_session_id')
    .execute();

  await db.schema
    .alterTable('funding_pledge')
    .dropColumn('payment_provider')
    .execute();

  await db.schema
    .alterTable('funding_pledge')
    .renameColumn('payment_session_id', 'stripe_checkout_session_id')
    .execute();
}
