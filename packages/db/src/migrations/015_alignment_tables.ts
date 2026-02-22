import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Stakeholder interests
  await db.schema
    .createTable('stakeholder_interest')
    .addColumn('uri', 'text', (col) => col.primaryKey())
    .addColumn('did', 'text', (col) => col.notNull())
    .addColumn('rkey', 'text', (col) => col.notNull())
    .addColumn('project_uri', 'text', (col) => col.notNull())
    .addColumn('interests', 'jsonb', (col) => col.notNull().defaultTo('[]'))
    .addColumn('contributions', 'jsonb', (col) => col.notNull().defaultTo('[]'))
    .addColumn('constraints', 'jsonb', (col) => col.notNull().defaultTo('[]'))
    .addColumn('red_lines', 'jsonb', (col) => col.notNull().defaultTo('[]'))
    .addColumn('preferences', 'jsonb', (col) => col.notNull().defaultTo('{}'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_stakeholder_interest_did_project')
    .on('stakeholder_interest')
    .columns(['did', 'project_uri'])
    .execute();

  // Desired outcomes
  await db.schema
    .createTable('desired_outcome')
    .addColumn('uri', 'text', (col) => col.primaryKey())
    .addColumn('did', 'text', (col) => col.notNull())
    .addColumn('rkey', 'text', (col) => col.notNull())
    .addColumn('project_uri', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('category', 'text', (col) => col.notNull())
    .addColumn('success_criteria', 'jsonb', (col) =>
      col.notNull().defaultTo('[]'),
    )
    .addColumn('stakeholder_support', 'jsonb', (col) =>
      col.notNull().defaultTo('[]'),
    )
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('proposed'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_desired_outcome_did_project')
    .on('desired_outcome')
    .columns(['did', 'project_uri'])
    .execute();

  // Interest map
  await db.schema
    .createTable('interest_map')
    .addColumn('uri', 'text', (col) => col.primaryKey())
    .addColumn('did', 'text', (col) => col.notNull())
    .addColumn('rkey', 'text', (col) => col.notNull())
    .addColumn('project_uri', 'text', (col) => col.notNull())
    .addColumn('alignment_zones', 'jsonb', (col) =>
      col.notNull().defaultTo('[]'),
    )
    .addColumn('conflict_zones', 'jsonb', (col) =>
      col.notNull().defaultTo('[]'),
    )
    .addColumn('ai_analysis', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_interest_map_did_project')
    .on('interest_map')
    .columns(['did', 'project_uri'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('interest_map').ifExists().execute();
  await db.schema.dropTable('desired_outcome').ifExists().execute();
  await db.schema.dropTable('stakeholder_interest').ifExists().execute();
}
