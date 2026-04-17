import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 063 — V8.13 Allow nullable cooperative_did on notifications
 *
 * Match notifications are cross-cooperative and have no natural sender.
 * The original NOT NULL constraint on notification.cooperative_did blocked
 * creation of these notifications. This migration drops the constraint so
 * system-generated notifications (matches, platform alerts) can omit a
 * cooperative context.
 *
 * This is a catalog-only change (ALTER COLUMN DROP NOT NULL) — no table
 * rewrite, no lock escalation beyond brief catalog update.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE notification ALTER COLUMN cooperative_did DROP NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Remove any rows without a cooperative_did before re-adding the constraint
  await sql`DELETE FROM notification WHERE cooperative_did IS NULL`.execute(db);
  await sql`
    ALTER TABLE notification ALTER COLUMN cooperative_did SET NOT NULL
  `.execute(db);
}
