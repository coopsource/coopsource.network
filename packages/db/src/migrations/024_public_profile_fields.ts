import type { Kysely } from 'kysely';

/**
 * Migration 024 — Public profile visibility fields
 *
 * Adds boolean visibility controls to cooperative_profile so
 * each co-op can decide what appears in public explore endpoints.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('cooperative_profile')
    .addColumn('public_description', 'boolean', (col) =>
      col.notNull().defaultTo(true),
    )
    .addColumn('public_members', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn('public_activity', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn('public_agreements', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn('public_campaigns', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('cooperative_profile')
    .dropColumn('public_description')
    .dropColumn('public_members')
    .dropColumn('public_activity')
    .dropColumn('public_agreements')
    .dropColumn('public_campaigns')
    .execute();
}
