import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // ─── Revenue entry table ─────────────────────────────────────────────
  await db.schema
    .createTable('revenue_entry')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('project_id', 'text')
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('amount', sql.raw('numeric(18,2)'), (col) => col.notNull())
    .addColumn('currency', 'text', (col) => col.notNull().defaultTo('USD'))
    .addColumn('source', 'text')
    .addColumn('source_reference', 'text')
    .addColumn('recorded_by', 'text', (col) => col.notNull())
    .addColumn('recorded_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('period_start', 'timestamptz')
    .addColumn('period_end', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_revenue_entry_coop_project_created')
    .on('revenue_entry')
    .columns(['cooperative_did', 'project_id', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_revenue_entry_coop_recorded')
    .on('revenue_entry')
    .columns(['cooperative_did', 'recorded_at'])
    .execute();

  await db.schema
    .createIndex('idx_revenue_entry_coop_source')
    .on('revenue_entry')
    .columns(['cooperative_did', 'source'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('revenue_entry').ifExists().execute();
}
