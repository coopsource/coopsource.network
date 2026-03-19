import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // ─── Schedule shift table ────────────────────────────────────────────
  await db.schema
    .createTable('schedule_shift')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('assigned_did', 'text')
    .addColumn('starts_at', 'timestamptz', (col) => col.notNull())
    .addColumn('ends_at', 'timestamptz', (col) => col.notNull())
    .addColumn('recurrence', 'text')
    .addColumn('location', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('open'))
    .addColumn('created_by', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`ALTER TABLE schedule_shift ADD CONSTRAINT schedule_shift_status_check
    CHECK (status IN ('open', 'assigned', 'completed', 'cancelled'))`.execute(db);

  await db.schema
    .createIndex('idx_schedule_shift_coop_starts')
    .on('schedule_shift')
    .columns(['cooperative_did', 'starts_at'])
    .execute();

  await db.schema
    .createIndex('idx_schedule_shift_coop_assigned_starts')
    .on('schedule_shift')
    .columns(['cooperative_did', 'assigned_did', 'starts_at'])
    .execute();

  await db.schema
    .createIndex('idx_schedule_shift_coop_status')
    .on('schedule_shift')
    .columns(['cooperative_did', 'status'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('schedule_shift').ifExists().execute();
}
