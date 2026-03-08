import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE cooperative_profile ADD COLUMN governance_visibility text NOT NULL DEFAULT 'open'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE cooperative_profile DROP COLUMN governance_visibility`.execute(db);
}
