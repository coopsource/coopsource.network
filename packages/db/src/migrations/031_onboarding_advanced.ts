import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Onboarding configuration — per-cooperative settings
  await db.schema
    .createTable('onboarding_config')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull().unique())
    .addColumn('probation_duration_days', 'integer', (col) =>
      col.notNull().defaultTo(90),
    )
    .addColumn('require_training', 'boolean', (col) => col.defaultTo(false))
    .addColumn('require_buy_in', 'boolean', (col) => col.defaultTo(false))
    .addColumn('buy_in_amount', sql.raw('numeric(18,2)'), (col) => col.defaultTo(0))
    .addColumn('buddy_system_enabled', 'boolean', (col) => col.defaultTo(false))
    .addColumn('milestones', 'jsonb', (col) => col.defaultTo(sql`'[]'::jsonb`))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Onboarding progress — tracks each member's onboarding journey
  await db.schema
    .createTable('onboarding_progress')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('member_did', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('in_progress'))
    .addColumn('probation_starts_at', 'timestamptz', (col) => col.notNull())
    .addColumn('probation_ends_at', 'timestamptz', (col) => col.notNull())
    .addColumn('buddy_did', 'text')
    .addColumn('training_completed', 'boolean', (col) => col.defaultTo(false))
    .addColumn('training_completed_at', 'timestamptz')
    .addColumn('buy_in_completed', 'boolean', (col) => col.defaultTo(false))
    .addColumn('buy_in_completed_at', 'timestamptz')
    .addColumn('milestones_completed', 'jsonb', (col) =>
      col.defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn('notes', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('completed_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('onboarding_progress_coop_member_unique')
    .on('onboarding_progress')
    .columns(['cooperative_did', 'member_did'])
    .unique()
    .execute();

  await db.schema
    .createIndex('onboarding_progress_coop_status')
    .on('onboarding_progress')
    .columns(['cooperative_did', 'status'])
    .execute();

  // Onboarding reviews — periodic reviews during probation
  await db.schema
    .createTable('onboarding_review')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('member_did', 'text', (col) => col.notNull())
    .addColumn('reviewer_did', 'text', (col) => col.notNull())
    .addColumn('review_type', 'text', (col) => col.notNull())
    .addColumn('outcome', 'text', (col) => col.notNull())
    .addColumn('comments', 'text')
    .addColumn('milestone_name', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('onboarding_review_coop_member')
    .on('onboarding_review')
    .columns(['cooperative_did', 'member_did'])
    .execute();

  // Delegation table — defined in schema but never migrated
  await db.schema
    .createTable('delegation')
    .addColumn('uri', 'text', (col) => col.primaryKey())
    .addColumn('did', 'text', (col) => col.notNull())
    .addColumn('rkey', 'text', (col) => col.notNull())
    .addColumn('project_uri', 'text', (col) => col.notNull())
    .addColumn('delegator_did', 'text', (col) => col.notNull())
    .addColumn('delegatee_did', 'text', (col) => col.notNull())
    .addColumn('scope', 'text', (col) => col.notNull())
    .addColumn('proposal_uri', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('delegation_coop_delegator')
    .on('delegation')
    .columns(['did', 'delegator_did', 'status'])
    .execute();

  await db.schema
    .createIndex('delegation_coop_delegatee')
    .on('delegation')
    .columns(['did', 'delegatee_did', 'status'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('delegation').execute();
  await db.schema.dropTable('onboarding_review').execute();
  await db.schema.dropTable('onboarding_progress').execute();
  await db.schema.dropTable('onboarding_config').execute();
}
