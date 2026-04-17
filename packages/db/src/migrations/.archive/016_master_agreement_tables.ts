import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Master agreements
  await db.schema
    .createTable('master_agreement')
    .addColumn('uri', 'text', (col) => col.primaryKey())
    .addColumn('did', 'text', (col) => col.notNull())
    .addColumn('rkey', 'text', (col) => col.notNull())
    .addColumn('project_uri', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('version', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('purpose', 'text')
    .addColumn('scope', 'text')
    .addColumn('agreement_type', 'text', (col) => col.notNull().defaultTo('custom'))
    .addColumn('governance_framework', 'jsonb')
    .addColumn('dispute_resolution', 'jsonb')
    .addColumn('amendment_process', 'jsonb')
    .addColumn('termination_conditions', 'jsonb')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('draft'))
    .addColumn('effective_date', 'timestamptz')
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
    .createIndex('idx_master_agreement_did_project')
    .on('master_agreement')
    .columns(['did', 'project_uri'])
    .execute();

  // Stakeholder terms
  await db.schema
    .createTable('stakeholder_terms')
    .addColumn('uri', 'text', (col) => col.primaryKey())
    .addColumn('did', 'text', (col) => col.notNull())
    .addColumn('rkey', 'text', (col) => col.notNull())
    .addColumn('master_agreement_uri', 'text', (col) => col.notNull())
    .addColumn('stakeholder_did', 'text', (col) => col.notNull())
    .addColumn('stakeholder_type', 'text', (col) => col.notNull())
    .addColumn('stakeholder_class', 'text')
    .addColumn('contributions', 'jsonb', (col) => col.notNull().defaultTo('[]'))
    .addColumn('financial_terms', 'jsonb', (col) => col.notNull().defaultTo('{}'))
    .addColumn('ip_terms', 'jsonb', (col) => col.notNull().defaultTo('{}'))
    .addColumn('governance_rights', 'jsonb', (col) => col.notNull().defaultTo('{}'))
    .addColumn('exit_terms', 'jsonb', (col) => col.notNull().defaultTo('{}'))
    .addColumn('signed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_stakeholder_terms_agreement')
    .on('stakeholder_terms')
    .columns(['master_agreement_uri'])
    .execute();

  await db.schema
    .createIndex('idx_stakeholder_terms_agreement_stakeholder')
    .on('stakeholder_terms')
    .columns(['master_agreement_uri', 'stakeholder_did'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('stakeholder_terms').ifExists().execute();
  await db.schema.dropTable('master_agreement').ifExists().execute();
}
