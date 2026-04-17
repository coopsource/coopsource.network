import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Update procurement_group status constraint to include 'open'
  await sql`ALTER TABLE procurement_group DROP CONSTRAINT procurement_group_status_check`.execute(db);
  await sql`UPDATE procurement_group SET status = 'open' WHERE status = 'collecting'`.execute(db);
  await sql`ALTER TABLE procurement_group ADD CONSTRAINT procurement_group_status_check
    CHECK (status IN ('open', 'collecting', 'negotiating', 'ordered', 'delivered', 'cancelled'))`.execute(db);
  await sql`ALTER TABLE procurement_group ALTER COLUMN status SET DEFAULT 'open'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE procurement_group DROP CONSTRAINT procurement_group_status_check`.execute(db);
  await sql`UPDATE procurement_group SET status = 'collecting' WHERE status = 'open'`.execute(db);
  await sql`ALTER TABLE procurement_group ADD CONSTRAINT procurement_group_status_check
    CHECK (status IN ('collecting', 'negotiating', 'ordered', 'delivered', 'cancelled'))`.execute(db);
  await sql`ALTER TABLE procurement_group ALTER COLUMN status SET DEFAULT 'collecting'`.execute(db);
}
