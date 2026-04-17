import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // ─── Collaborative project table ────────────────────────────────────
  await db.schema
    .createTable('collaborative_project')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('host_cooperative_did', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('status', 'text', (col) =>
      col.notNull().defaultTo('planning'),
    )
    .addColumn('participant_dids', sql.raw('text[]'), (col) =>
      col.notNull().defaultTo(sql`'{}'`),
    )
    .addColumn('uri', 'text')
    .addColumn('cid', 'text')
    .addColumn('revenue_split', 'jsonb')
    .addColumn('created_by', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`ALTER TABLE collaborative_project ADD CONSTRAINT collaborative_project_status_check
    CHECK (status IN ('planning', 'active', 'completed', 'cancelled'))`.execute(db);

  await db.schema
    .createIndex('idx_collaborative_project_host_status')
    .on('collaborative_project')
    .columns(['host_cooperative_did', 'status'])
    .execute();

  await db.schema
    .createIndex('idx_collaborative_project_status_created')
    .on('collaborative_project')
    .columns(['status', 'created_at'])
    .execute();

  // ─── Collaborative contribution table ───────────────────────────────
  await db.schema
    .createTable('collaborative_contribution')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('project_id', 'text', (col) => col.notNull())
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('hours_contributed', sql.raw('numeric(10,2)'), (col) =>
      col.defaultTo(0),
    )
    .addColumn('revenue_earned', sql.raw('numeric(18,2)'), (col) =>
      col.defaultTo(0),
    )
    .addColumn('expense_incurred', sql.raw('numeric(18,2)'), (col) =>
      col.defaultTo(0),
    )
    .addColumn('period_start', 'timestamptz')
    .addColumn('period_end', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addUniqueConstraint('uq_collaborative_contribution_project_coop_period', [
      'project_id',
      'cooperative_did',
      'period_start',
    ])
    .execute();

  await db.schema
    .createIndex('idx_collaborative_contribution_project_coop')
    .on('collaborative_contribution')
    .columns(['project_id', 'cooperative_did'])
    .execute();

  await db.schema
    .createIndex('idx_collaborative_contribution_coop_created')
    .on('collaborative_contribution')
    .columns(['cooperative_did', 'created_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('collaborative_contribution').ifExists().execute();
  await db.schema.dropTable('collaborative_project').ifExists().execute();
}
