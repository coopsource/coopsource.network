import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Drop the unique constraint on (group_id, cooperative_did) to allow
  // multiple demands from the same cooperative within a procurement group
  await sql`ALTER TABLE procurement_demand DROP CONSTRAINT IF EXISTS uq_procurement_demand_group_coop`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE procurement_demand
    ADD CONSTRAINT uq_procurement_demand_group_coop
    UNIQUE (group_id, cooperative_did)`.execute(db);
}
