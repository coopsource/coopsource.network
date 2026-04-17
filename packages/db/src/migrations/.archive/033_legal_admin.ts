import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Legal documents (bylaws, articles, policies, resolutions)
  await db.schema
    .createTable('legal_document')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('uri', 'text')
    .addColumn('cid', 'text')
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('author_did', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('body', 'text')
    .addColumn('body_format', 'text', (col) => col.notNull().defaultTo('markdown'))
    .addColumn('document_type', 'text', (col) => col.notNull())
    .addColumn('version', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('previous_version_uri', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('draft'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('invalidated_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('idx_legal_document_coop')
    .on('legal_document')
    .column('cooperative_did')
    .execute();

  await db.schema
    .createIndex('idx_legal_document_prev')
    .on('legal_document')
    .column('previous_version_uri')
    .execute();

  // Meeting records
  await db.schema
    .createTable('meeting_record')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('uri', 'text')
    .addColumn('cid', 'text')
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('author_did', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('meeting_date', 'timestamptz', (col) => col.notNull())
    .addColumn('meeting_type', 'text', (col) => col.notNull())
    .addColumn('attendee_dids', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn('quorum_met', 'boolean')
    .addColumn('resolutions', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn('minutes', 'text')
    .addColumn('certified_by', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('invalidated_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('idx_meeting_record_coop')
    .on('meeting_record')
    .column('cooperative_did')
    .execute();

  // Administrative officers
  await db.schema
    .createTable('admin_officer')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('uri', 'text')
    .addColumn('cid', 'text')
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('officer_did', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('appointed_at', 'timestamptz', (col) => col.notNull())
    .addColumn('term_ends_at', 'timestamptz')
    .addColumn('appointment_type', 'text', (col) => col.notNull())
    .addColumn('responsibilities', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('invalidated_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('idx_admin_officer_coop')
    .on('admin_officer')
    .column('cooperative_did')
    .execute();

  await db.schema
    .createIndex('idx_admin_officer_did')
    .on('admin_officer')
    .column('officer_did')
    .execute();

  // Compliance items
  await db.schema
    .createTable('compliance_item')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('uri', 'text')
    .addColumn('cid', 'text')
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('due_date', 'timestamptz', (col) => col.notNull())
    .addColumn('filing_type', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('completed_at', 'timestamptz')
    .addColumn('completed_by', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('invalidated_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('idx_compliance_item_coop')
    .on('compliance_item')
    .column('cooperative_did')
    .execute();

  await db.schema
    .createIndex('idx_compliance_item_due')
    .on('compliance_item')
    .column('due_date')
    .execute();

  // Member notices
  await db.schema
    .createTable('member_notice')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('uri', 'text')
    .addColumn('cid', 'text')
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('author_did', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('body', 'text', (col) => col.notNull())
    .addColumn('notice_type', 'text', (col) => col.notNull())
    .addColumn('target_audience', 'text', (col) => col.notNull())
    .addColumn('sent_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('invalidated_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('idx_member_notice_coop')
    .on('member_notice')
    .column('cooperative_did')
    .execute();

  // Fiscal periods
  await db.schema
    .createTable('fiscal_period')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('uri', 'text')
    .addColumn('cid', 'text')
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('label', 'text', (col) => col.notNull())
    .addColumn('starts_at', 'timestamptz', (col) => col.notNull())
    .addColumn('ends_at', 'timestamptz', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('open'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('invalidated_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('idx_fiscal_period_coop')
    .on('fiscal_period')
    .column('cooperative_did')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('fiscal_period').ifExists().execute();
  await db.schema.dropTable('member_notice').ifExists().execute();
  await db.schema.dropTable('compliance_item').ifExists().execute();
  await db.schema.dropTable('admin_officer').ifExists().execute();
  await db.schema.dropTable('meeting_record').ifExists().execute();
  await db.schema.dropTable('legal_document').ifExists().execute();
}
