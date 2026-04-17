import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // ─── Report template table ─────────────────────────────────────────
  await db.schema
    .createTable('report_template')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('report_type', 'text', (col) => col.notNull())
    .addColumn('config', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_by', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addUniqueConstraint('uq_report_template_coop_name', [
      'cooperative_did',
      'name',
    ])
    .execute();

  await sql`ALTER TABLE report_template ADD CONSTRAINT report_template_type_check
    CHECK (report_type IN ('annual', 'board_packet', 'equity_statement', 'patronage', 'commerce', 'custom'))`.execute(db);

  await db.schema
    .createIndex('idx_report_template_coop_type')
    .on('report_template')
    .columns(['cooperative_did', 'report_type'])
    .execute();

  // ─── Report snapshot table ─────────────────────────────────────────
  await db.schema
    .createTable('report_snapshot')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('template_id', 'text')
    .addColumn('report_type', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('data', 'jsonb', (col) => col.notNull())
    .addColumn('generated_by', 'text', (col) => col.notNull())
    .addColumn('generated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('period_start', 'timestamptz')
    .addColumn('period_end', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('idx_report_snapshot_coop_type_generated')
    .on('report_snapshot')
    .columns(['cooperative_did', 'report_type'])
    .execute();

  // ─── Notification preference table ─────────────────────────────────
  await db.schema
    .createTable('notification_preference')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('member_did', 'text', (col) => col.notNull())
    .addColumn('channel', 'text', (col) => col.notNull().defaultTo('in_app'))
    .addColumn('event_types', sql.raw('text[]'), (col) =>
      col.notNull().defaultTo(sql`'{}'`),
    )
    .addColumn('digest_frequency', 'text', (col) => col.defaultTo('immediate'))
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addUniqueConstraint('uq_notification_pref_coop_member_channel', [
      'cooperative_did',
      'member_did',
      'channel',
    ])
    .execute();

  await sql`ALTER TABLE notification_preference ADD CONSTRAINT notification_pref_channel_check
    CHECK (channel IN ('in_app', 'email', 'digest'))`.execute(db);

  await sql`ALTER TABLE notification_preference ADD CONSTRAINT notification_pref_digest_check
    CHECK (digest_frequency IN ('immediate', 'daily', 'weekly'))`.execute(db);

  // ─── Mention table ─────────────────────────────────────────────────
  await db.schema
    .createTable('mention')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('source_type', 'text', (col) => col.notNull())
    .addColumn('source_id', 'text', (col) => col.notNull())
    .addColumn('mentioned_did', 'text', (col) => col.notNull())
    .addColumn('mentioned_by', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('read_at', 'timestamptz')
    .execute();

  await sql`ALTER TABLE mention ADD CONSTRAINT mention_source_type_check
    CHECK (source_type IN ('post', 'task', 'proposal', 'expense', 'agreement'))`.execute(db);

  await db.schema
    .createIndex('idx_mention_mentioned_did_read_created')
    .on('mention')
    .columns(['mentioned_did', 'read_at', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_mention_coop_source')
    .on('mention')
    .columns(['cooperative_did', 'source_type', 'source_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('mention').ifExists().execute();
  await db.schema.dropTable('notification_preference').ifExists().execute();
  await db.schema.dropTable('report_snapshot').ifExists().execute();
  await db.schema.dropTable('report_template').ifExists().execute();
}
