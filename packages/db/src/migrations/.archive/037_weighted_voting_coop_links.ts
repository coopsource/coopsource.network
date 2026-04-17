import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // ─── Member class table ────────────────────────────────────────────
  await db.schema
    .createTable('member_class')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('vote_weight', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('quorum_weight', sql.raw('numeric(5,2)'), (col) =>
      col.notNull().defaultTo(1.0),
    )
    .addColumn('board_seats', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('member_class_coop_name_unique')
    .on('member_class')
    .columns(['cooperative_did', 'name'])
    .unique()
    .execute();

  // ─── Cooperative link table ────────────────────────────────────────
  await db.schema
    .createTable('cooperative_link')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('initiator_did', 'text', (col) => col.notNull())
    .addColumn('target_did', 'text', (col) => col.notNull())
    .addColumn('link_type', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('description', 'text')
    .addColumn('metadata', 'jsonb')
    .addColumn('initiated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('responded_at', 'timestamptz')
    .addColumn('dissolved_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('cooperative_link_initiator_target_unique')
    .on('cooperative_link')
    .columns(['initiator_did', 'target_did'])
    .unique()
    .execute();

  await db.schema
    .createIndex('cooperative_link_status')
    .on('cooperative_link')
    .columns(['status'])
    .execute();

  // ─── Add member_class column to membership ─────────────────────────
  await db.schema
    .alterTable('membership')
    .addColumn('member_class', 'text')
    .execute();

  // ─── Add vote_weight column to vote ────────────────────────────────
  await db.schema
    .alterTable('vote')
    .addColumn('vote_weight', 'integer', (col) => col.notNull().defaultTo(1))
    .execute();

  // ─── Add class_quorum_rules column to proposal ─────────────────────
  await db.schema
    .alterTable('proposal')
    .addColumn('class_quorum_rules', 'jsonb')
    .execute();

  // ─── Fix proposal outcome constraint ───────────────────────────────
  await sql`ALTER TABLE proposal DROP CONSTRAINT IF EXISTS proposal_outcome_check`.execute(db);
  await sql`ALTER TABLE proposal ADD CONSTRAINT proposal_outcome_check
    CHECK (outcome IS NULL OR outcome IN ('passed', 'failed', 'no_quorum', 'class_quorum_not_met'))`.execute(db);

  // ─── Constraints on new tables ─────────────────────────────────────
  await sql`ALTER TABLE member_class ADD CONSTRAINT member_class_vote_weight_check
    CHECK (vote_weight >= 1 AND vote_weight <= 100)`.execute(db);

  await sql`ALTER TABLE cooperative_link ADD CONSTRAINT cooperative_link_type_check
    CHECK (link_type IN ('partnership', 'supply_chain', 'shared_infrastructure', 'federation', 'other'))`.execute(db);

  await sql`ALTER TABLE cooperative_link ADD CONSTRAINT cooperative_link_status_check
    CHECK (status IN ('pending', 'active', 'declined', 'dissolved'))`.execute(db);

  await sql`ALTER TABLE cooperative_link ADD CONSTRAINT cooperative_link_no_self_link
    CHECK (initiator_did <> target_did)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop columns from existing tables
  await db.schema.alterTable('proposal').dropColumn('class_quorum_rules').execute();
  await db.schema.alterTable('vote').dropColumn('vote_weight').execute();
  await db.schema.alterTable('membership').dropColumn('member_class').execute();

  // Drop new tables
  await db.schema.dropTable('cooperative_link').execute();
  await db.schema.dropTable('member_class').execute();

  // Restore original outcome constraint (if it existed)
  await sql`ALTER TABLE proposal DROP CONSTRAINT IF EXISTS proposal_outcome_check`.execute(db);
  await sql`ALTER TABLE proposal ADD CONSTRAINT proposal_outcome_check
    CHECK (outcome IS NULL OR outcome IN ('passed', 'failed', 'no_quorum'))`.execute(db);
}
