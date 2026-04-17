import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // ─── Time entry table ────────────────────────────────────────────────
  await db.schema
    .createTable('time_entry')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('member_did', 'text', (col) => col.notNull())
    .addColumn('task_id', 'text')
    .addColumn('project_id', 'text')
    .addColumn('description', 'text')
    .addColumn('started_at', 'timestamptz', (col) => col.notNull())
    .addColumn('ended_at', 'timestamptz')
    .addColumn('duration_minutes', 'integer')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('draft'))
    .addColumn('approved_by', 'text')
    .addColumn('approved_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`ALTER TABLE time_entry ADD CONSTRAINT time_entry_status_check
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected'))`.execute(db);

  await db.schema
    .createIndex('idx_time_entry_coop_member_created')
    .on('time_entry')
    .columns(['cooperative_did', 'member_did', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_time_entry_coop_task')
    .on('time_entry')
    .columns(['cooperative_did', 'task_id'])
    .execute();

  await db.schema
    .createIndex('idx_time_entry_coop_project_created')
    .on('time_entry')
    .columns(['cooperative_did', 'project_id', 'created_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('time_entry').ifExists().execute();
}
