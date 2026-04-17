import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // ─── Task table ──────────────────────────────────────────────────────
  await db.schema
    .createTable('task')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('project_id', 'text')
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('backlog'))
    .addColumn('priority', 'text', (col) => col.notNull().defaultTo('medium'))
    .addColumn('assignee_dids', sql.raw('text[]'), (col) =>
      col.defaultTo(sql`'{}'`),
    )
    .addColumn('due_date', 'timestamptz')
    .addColumn('labels', sql.raw('text[]'), (col) =>
      col.defaultTo(sql`'{}'`),
    )
    .addColumn('linked_proposal_id', 'text')
    .addColumn('uri', 'text')
    .addColumn('cid', 'text')
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

  await sql`ALTER TABLE task ADD CONSTRAINT task_status_check
    CHECK (status IN ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'))`.execute(db);

  await sql`ALTER TABLE task ADD CONSTRAINT task_priority_check
    CHECK (priority IN ('urgent', 'high', 'medium', 'low'))`.execute(db);

  await db.schema
    .createIndex('idx_task_coop_status_created')
    .on('task')
    .columns(['cooperative_did', 'status', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_task_coop_project')
    .on('task')
    .columns(['cooperative_did', 'project_id'])
    .execute();

  await db.schema
    .createIndex('idx_task_coop_created')
    .on('task')
    .columns(['cooperative_did', 'created_at'])
    .execute();

  // ─── Task label table ────────────────────────────────────────────────
  await db.schema
    .createTable('task_label')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('color', 'text', (col) => col.defaultTo('#6366f1'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addUniqueConstraint('uq_task_label_coop_name', [
      'cooperative_did',
      'name',
    ])
    .execute();

  // ─── Task checklist item table ───────────────────────────────────────
  await db.schema
    .createTable('task_checklist_item')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('task_id', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('completed', 'boolean', (col) => col.defaultTo(false))
    .addColumn('sort_order', 'integer', (col) => col.defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_task_checklist_item_task_sort')
    .on('task_checklist_item')
    .columns(['task_id', 'sort_order'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('task_checklist_item').ifExists().execute();
  await db.schema.dropTable('task_label').ifExists().execute();
  await db.schema.dropTable('task').ifExists().execute();
}
