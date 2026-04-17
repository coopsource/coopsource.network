import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Patronage config — per-cooperative calculation rules
  await db.schema
    .createTable('patronage_config')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('stakeholder_class', 'text')
    .addColumn('metric_type', 'text', (col) => col.notNull())
    .addColumn('metric_weights', 'jsonb')
    .addColumn('cash_payout_pct', 'integer', (col) =>
      col.notNull().defaultTo(20),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addUniqueConstraint('uq_patronage_config_coop_class', [
      'cooperative_did',
      'stakeholder_class',
    ])
    .execute();

  await db.schema
    .createIndex('idx_patronage_config_coop')
    .on('patronage_config')
    .column('cooperative_did')
    .execute();

  // Patronage record — per-member calculated patronage for a fiscal period
  await db.schema
    .createTable('patronage_record')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('fiscal_period_id', 'text', (col) => col.notNull())
    .addColumn('member_did', 'text', (col) => col.notNull())
    .addColumn('stakeholder_class', 'text')
    .addColumn('metric_value', sql.raw('numeric(18,4)'), (col) =>
      col.notNull(),
    )
    .addColumn('patronage_ratio', sql.raw('numeric(10,8)'), (col) =>
      col.notNull(),
    )
    .addColumn('total_allocation', sql.raw('numeric(18,2)'), (col) =>
      col.notNull(),
    )
    .addColumn('cash_amount', sql.raw('numeric(18,2)'), (col) =>
      col.notNull(),
    )
    .addColumn('retained_amount', sql.raw('numeric(18,2)'), (col) =>
      col.notNull(),
    )
    .addColumn('status', 'text', (col) =>
      col.notNull().defaultTo('calculated'),
    )
    .addColumn('approved_at', 'timestamptz')
    .addColumn('distributed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addUniqueConstraint('uq_patronage_record_period_member', [
      'fiscal_period_id',
      'member_did',
      'stakeholder_class',
    ])
    .execute();

  await db.schema
    .createIndex('idx_patronage_record_coop')
    .on('patronage_record')
    .column('cooperative_did')
    .execute();

  await db.schema
    .createIndex('idx_patronage_record_period')
    .on('patronage_record')
    .column('fiscal_period_id')
    .execute();

  await db.schema
    .createIndex('idx_patronage_record_member')
    .on('patronage_record')
    .column('member_did')
    .execute();

  // Capital account — one per member per cooperative
  await db.schema
    .createTable('capital_account')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('member_did', 'text', (col) => col.notNull())
    .addColumn('initial_contribution', sql.raw('numeric(18,2)'), (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('total_patronage_allocated', sql.raw('numeric(18,2)'), (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('total_redeemed', sql.raw('numeric(18,2)'), (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('balance', sql.raw('numeric(18,2)'), (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addUniqueConstraint('uq_capital_account_coop_member', [
      'cooperative_did',
      'member_did',
    ])
    .execute();

  await db.schema
    .createIndex('idx_capital_account_coop')
    .on('capital_account')
    .column('cooperative_did')
    .execute();

  await db.schema
    .createIndex('idx_capital_account_member')
    .on('capital_account')
    .column('member_did')
    .execute();

  // Capital account transaction — immutable ledger
  await db.schema
    .createTable('capital_account_transaction')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('capital_account_id', 'text', (col) => col.notNull())
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('member_did', 'text', (col) => col.notNull())
    .addColumn('transaction_type', 'text', (col) => col.notNull())
    .addColumn('amount', sql.raw('numeric(18,2)'), (col) => col.notNull())
    .addColumn('fiscal_period_id', 'text')
    .addColumn('patronage_record_id', 'text')
    .addColumn('description', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('created_by', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex('idx_cap_acct_txn_account')
    .on('capital_account_transaction')
    .column('capital_account_id')
    .execute();

  await db.schema
    .createIndex('idx_cap_acct_txn_coop')
    .on('capital_account_transaction')
    .column('cooperative_did')
    .execute();

  // Tax form 1099-PATR — tracks generation status
  await db.schema
    .createTable('tax_form_1099_patr')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('fiscal_period_id', 'text', (col) => col.notNull())
    .addColumn('member_did', 'text', (col) => col.notNull())
    .addColumn('tax_year', 'integer', (col) => col.notNull())
    .addColumn('patronage_dividends', sql.raw('numeric(18,2)'), (col) =>
      col.notNull(),
    )
    .addColumn('per_unit_retain_allocated', sql.raw('numeric(18,2)'), (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('qualified_payments', sql.raw('numeric(18,2)'), (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('cash_paid', sql.raw('numeric(18,2)'), (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('cash_deadline', 'timestamptz', (col) => col.notNull())
    .addColumn('cash_paid_at', 'timestamptz')
    .addColumn('generation_status', 'text', (col) =>
      col.notNull().defaultTo('pending'),
    )
    .addColumn('generated_at', 'timestamptz')
    .addColumn('sent_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addUniqueConstraint('uq_1099patr_period_member', [
      'fiscal_period_id',
      'member_did',
    ])
    .execute();

  await db.schema
    .createIndex('idx_1099patr_coop')
    .on('tax_form_1099_patr')
    .column('cooperative_did')
    .execute();

  await db.schema
    .createIndex('idx_1099patr_year')
    .on('tax_form_1099_patr')
    .column('tax_year')
    .execute();

  await db.schema
    .createIndex('idx_1099patr_deadline')
    .on('tax_form_1099_patr')
    .column('cash_deadline')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('tax_form_1099_patr').ifExists().execute();
  await db.schema.dropTable('capital_account_transaction').ifExists().execute();
  await db.schema.dropTable('capital_account').ifExists().execute();
  await db.schema.dropTable('patronage_record').ifExists().execute();
  await db.schema.dropTable('patronage_config').ifExists().execute();
}
