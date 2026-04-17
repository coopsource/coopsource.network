import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 032 — Ecosystem reference tables
 *
 * Cross-references between governance proposals and external ATProto apps:
 * - Smoke Signal calendar events (meeting quorum tracking)
 * - Frontpage posts (community discussion cross-posting)
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // Calendar event references (Smoke Signal integration)
  await db.schema
    .createTable('calendar_event_ref')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('event_uri', 'text', (col) => col.notNull().unique())
    .addColumn('proposal_uri', 'text')
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('title', 'text')
    .addColumn('starts_at', 'timestamptz')
    .addColumn('rsvp_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_calendar_event_ref_proposal')
    .on('calendar_event_ref')
    .column('proposal_uri')
    .execute();

  // Frontpage post references
  await db.schema
    .createTable('frontpage_post_ref')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('post_uri', 'text', (col) => col.notNull().unique())
    .addColumn('proposal_uri', 'text')
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('title', 'text')
    .addColumn('comment_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_frontpage_post_ref_proposal')
    .on('frontpage_post_ref')
    .column('proposal_uri')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('frontpage_post_ref').execute();
  await db.schema.dropTable('calendar_event_ref').execute();
}
