import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // ─── Inter-cooperative agreement table ──────────────────────────────
  await db.schema
    .createTable('intercoop_agreement')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('initiator_did', 'text', (col) => col.notNull())
    .addColumn('responder_did', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('agreement_type', 'text', (col) =>
      col.notNull().defaultTo('service'),
    )
    .addColumn('initiator_uri', 'text')
    .addColumn('initiator_cid', 'text')
    .addColumn('responder_uri', 'text')
    .addColumn('responder_cid', 'text')
    .addColumn('status', 'text', (col) =>
      col.notNull().defaultTo('proposed'),
    )
    .addColumn('terms', 'jsonb')
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

  await sql`ALTER TABLE intercoop_agreement ADD CONSTRAINT intercoop_agreement_status_check
    CHECK (status IN ('proposed', 'negotiating', 'active', 'completed', 'cancelled'))`.execute(db);

  await sql`ALTER TABLE intercoop_agreement ADD CONSTRAINT intercoop_agreement_type_check
    CHECK (agreement_type IN ('service', 'supply', 'joint_venture', 'procurement', 'resource_sharing', 'other'))`.execute(db);

  await sql`ALTER TABLE intercoop_agreement ADD CONSTRAINT intercoop_agreement_different_parties_check
    CHECK (initiator_did <> responder_did)`.execute(db);

  // Partial unique: only one active agreement per initiator+responder+title
  await sql`
    CREATE UNIQUE INDEX idx_intercoop_agreement_active_unique
    ON intercoop_agreement(initiator_did, responder_did, title)
    WHERE status NOT IN ('completed', 'cancelled')
  `.execute(db);

  await db.schema
    .createIndex('idx_intercoop_agreement_initiator_status')
    .on('intercoop_agreement')
    .columns(['initiator_did', 'status'])
    .execute();

  await db.schema
    .createIndex('idx_intercoop_agreement_responder_status')
    .on('intercoop_agreement')
    .columns(['responder_did', 'status'])
    .execute();

  await db.schema
    .createIndex('idx_intercoop_agreement_status_created')
    .on('intercoop_agreement')
    .columns(['status', 'created_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('intercoop_agreement').ifExists().execute();
}
