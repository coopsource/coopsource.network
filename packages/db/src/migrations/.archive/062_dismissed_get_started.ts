import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 062 — V8.9 Get Started card dismiss preference
 *
 * Adds `profile.dismissed_get_started` — a boolean flag that tracks whether
 * the user has dismissed the onboarding "Get Started" card from their
 * dashboard. When true, the card is hidden.
 *
 * This is an O(1) catalog-only change: `BOOLEAN NOT NULL DEFAULT false` with
 * a non-volatile default is a metadata-only operation in PostgreSQL 11+. No
 * table rewrite, no ACCESS EXCLUSIVE lock beyond the brief catalog update, no
 * maintenance window needed.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE profile
      ADD COLUMN dismissed_get_started BOOLEAN NOT NULL DEFAULT false
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE profile DROP COLUMN IF EXISTS dismissed_get_started
  `.execute(db);
}
