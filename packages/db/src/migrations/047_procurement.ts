import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // ─── Procurement group table ────────────────────────────────────────
  await db.schema
    .createTable('procurement_group')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('network_did', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('category', 'text')
    .addColumn('target_quantity', 'integer')
    .addColumn('deadline', 'timestamptz')
    .addColumn('status', 'text', (col) =>
      col.notNull().defaultTo('collecting'),
    )
    .addColumn('created_by', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`ALTER TABLE procurement_group ADD CONSTRAINT procurement_group_status_check
    CHECK (status IN ('collecting', 'negotiating', 'ordered', 'delivered', 'cancelled'))`.execute(db);

  await db.schema
    .createIndex('idx_procurement_group_network_status_created')
    .on('procurement_group')
    .columns(['network_did', 'status', 'created_at'])
    .execute();

  // ─── Procurement demand table ───────────────────────────────────────
  await db.schema
    .createTable('procurement_demand')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('group_id', 'text', (col) => col.notNull())
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('quantity', 'integer', (col) => col.notNull())
    .addColumn('notes', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addUniqueConstraint('uq_procurement_demand_group_coop', [
      'group_id',
      'cooperative_did',
    ])
    .execute();

  await db.schema
    .createIndex('idx_procurement_demand_group')
    .on('procurement_demand')
    .columns(['group_id'])
    .execute();

  await db.schema
    .createIndex('idx_procurement_demand_coop')
    .on('procurement_demand')
    .columns(['cooperative_did'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('procurement_demand').ifExists().execute();
  await db.schema.dropTable('procurement_group').ifExists().execute();
}
