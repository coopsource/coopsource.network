import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // ─── Shared resource table ──────────────────────────────────────────
  await db.schema
    .createTable('shared_resource')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('resource_type', 'text', (col) => col.notNull())
    .addColumn('availability_schedule', 'jsonb')
    .addColumn('location', 'text')
    .addColumn('cost_per_unit', sql.raw('numeric(18,2)'))
    .addColumn('cost_unit', 'text')
    .addColumn('uri', 'text')
    .addColumn('cid', 'text')
    .addColumn('status', 'text', (col) =>
      col.notNull().defaultTo('available'),
    )
    .addColumn('created_by', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`ALTER TABLE shared_resource ADD CONSTRAINT shared_resource_status_check
    CHECK (status IN ('available', 'reserved', 'unavailable'))`.execute(db);

  await sql`ALTER TABLE shared_resource ADD CONSTRAINT shared_resource_type_check
    CHECK (resource_type IN ('equipment', 'space', 'expertise', 'vehicle', 'other'))`.execute(db);

  await db.schema
    .createIndex('idx_shared_resource_coop_status')
    .on('shared_resource')
    .columns(['cooperative_did', 'status'])
    .execute();

  await db.schema
    .createIndex('idx_shared_resource_type_status')
    .on('shared_resource')
    .columns(['resource_type', 'status'])
    .execute();

  // ─── Resource booking table ─────────────────────────────────────────
  await db.schema
    .createTable('resource_booking')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('resource_id', 'text', (col) => col.notNull())
    .addColumn('requesting_did', 'text', (col) => col.notNull())
    .addColumn('starts_at', 'timestamptz', (col) => col.notNull())
    .addColumn('ends_at', 'timestamptz', (col) => col.notNull())
    .addColumn('purpose', 'text')
    .addColumn('status', 'text', (col) =>
      col.notNull().defaultTo('pending'),
    )
    .addColumn('cost_total', sql.raw('numeric(18,2)'))
    .addColumn('approved_by', 'text')
    .addColumn('approved_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`ALTER TABLE resource_booking ADD CONSTRAINT resource_booking_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled'))`.execute(db);

  await db.schema
    .createIndex('idx_resource_booking_resource_starts')
    .on('resource_booking')
    .columns(['resource_id', 'starts_at'])
    .execute();

  await db.schema
    .createIndex('idx_resource_booking_requesting_status')
    .on('resource_booking')
    .columns(['requesting_did', 'status'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('resource_booking').ifExists().execute();
  await db.schema.dropTable('shared_resource').ifExists().execute();
}
