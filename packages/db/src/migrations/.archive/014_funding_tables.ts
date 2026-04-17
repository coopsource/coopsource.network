import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Funding campaigns
  await db.schema
    .createTable('funding_campaign')
    .addColumn('uri', 'text', (col) => col.primaryKey())
    .addColumn('did', 'text', (col) => col.notNull())
    .addColumn('rkey', 'text', (col) => col.notNull())
    .addColumn('beneficiary_uri', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('tier', 'text', (col) => col.notNull())
    .addColumn('campaign_type', 'text', (col) => col.notNull())
    .addColumn('goal_amount', 'integer', (col) => col.notNull())
    .addColumn('goal_currency', 'text', (col) => col.notNull().defaultTo('USD'))
    .addColumn('amount_raised', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('backer_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('funding_model', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('draft'))
    .addColumn('start_date', 'timestamptz')
    .addColumn('end_date', 'timestamptz')
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Indexes for campaign queries
  await db.schema
    .createIndex('idx_funding_campaign_did_status')
    .on('funding_campaign')
    .columns(['did', 'status'])
    .execute();

  // Funding pledges
  await db.schema
    .createTable('funding_pledge')
    .addColumn('uri', 'text', (col) => col.primaryKey())
    .addColumn('did', 'text', (col) => col.notNull())
    .addColumn('rkey', 'text', (col) => col.notNull())
    .addColumn('campaign_uri', 'text', (col) => col.notNull())
    .addColumn('backer_did', 'text', (col) => col.notNull())
    .addColumn('amount', 'integer', (col) => col.notNull())
    .addColumn('currency', 'text', (col) => col.notNull().defaultTo('USD'))
    .addColumn('payment_status', 'text', (col) =>
      col.notNull().defaultTo('pending'),
    )
    .addColumn('stripe_checkout_session_id', 'text')
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Indexes for pledge queries
  await db.schema
    .createIndex('idx_funding_pledge_campaign_uri')
    .on('funding_pledge')
    .column('campaign_uri')
    .execute();

  await db.schema
    .createIndex('idx_funding_pledge_stripe_session')
    .on('funding_pledge')
    .column('stripe_checkout_session_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('funding_pledge').ifExists().execute();
  await db.schema.dropTable('funding_campaign').ifExists().execute();
}
