import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Decouple entity_key from entity table.
 *
 * entity_key.entity_did cannot have an FK to entity.did because
 * LocalPdsService.createDid() stores the signing key BEFORE the
 * application creates the entity row (the PDS layer is independent
 * of the application entity model). Application logic ensures the
 * entity exists before keys are used; the FK is not needed.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE entity_key
      DROP CONSTRAINT IF EXISTS entity_key_entity_did_fkey
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE entity_key
      ADD CONSTRAINT entity_key_entity_did_fkey
      FOREIGN KEY (entity_did) REFERENCES entity(did)
  `.execute(db);
}
