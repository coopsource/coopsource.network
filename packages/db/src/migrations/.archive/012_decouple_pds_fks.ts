import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Decouple pds_record and pds_commit from entity table.
 *
 * pds_record.did and pds_commit.did cannot have FKs to entity.did because
 * LocalPdsService.createRecord() writes PDS records BEFORE the application
 * creates the entity row (the PDS layer is independent of the application
 * entity model). Same rationale as migration 010 for entity_key.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE pds_record
      DROP CONSTRAINT IF EXISTS pds_record_did_fkey
  `.execute(db);

  await sql`
    ALTER TABLE pds_commit
      DROP CONSTRAINT IF EXISTS pds_commit_did_fkey
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE pds_record
      ADD CONSTRAINT pds_record_did_fkey
      FOREIGN KEY (did) REFERENCES entity(did)
  `.execute(db);

  await sql`
    ALTER TABLE pds_commit
      ADD CONSTRAINT pds_commit_did_fkey
      FOREIGN KEY (did) REFERENCES entity(did)
  `.execute(db);
}
