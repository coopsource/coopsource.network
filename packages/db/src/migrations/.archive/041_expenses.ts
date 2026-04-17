import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // ─── Expense category table ──────────────────────────────────────────
  await db.schema
    .createTable('expense_category')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('budget_limit', sql.raw('numeric(18,2)'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addUniqueConstraint('uq_expense_category_coop_name', [
      'cooperative_did',
      'name',
    ])
    .execute();

  // ─── Expense table ──────────────────────────────────────────────────
  await db.schema
    .createTable('expense')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('member_did', 'text', (col) => col.notNull())
    .addColumn('category_id', 'text')
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('amount', sql.raw('numeric(18,2)'), (col) => col.notNull())
    .addColumn('currency', 'text', (col) => col.notNull().defaultTo('USD'))
    .addColumn('receipt_blob_cid', 'text')
    .addColumn('status', 'text', (col) =>
      col.notNull().defaultTo('submitted'),
    )
    .addColumn('reviewed_by', 'text')
    .addColumn('reviewed_at', 'timestamptz')
    .addColumn('review_note', 'text')
    .addColumn('reimbursed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`ALTER TABLE expense ADD CONSTRAINT expense_status_check
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'reimbursed'))`.execute(db);

  await db.schema
    .createIndex('idx_expense_coop_status_created')
    .on('expense')
    .columns(['cooperative_did', 'status', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_expense_coop_member_created')
    .on('expense')
    .columns(['cooperative_did', 'member_did', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_expense_coop_category')
    .on('expense')
    .columns(['cooperative_did', 'category_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('expense').ifExists().execute();
  await db.schema.dropTable('expense_category').ifExists().execute();
}
