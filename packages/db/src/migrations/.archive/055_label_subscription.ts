import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Add seq column + indexes to governance_label for ATProto label subscription.
 * The seq column provides monotonically increasing cursor values for
 * com.atproto.label.subscribeLabels replay.
 *
 * BIGSERIAL is not allowed in ALTER TABLE, so we manually create the
 * sequence and wire it up as the column default.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // Create a sequence for the seq column
  await sql`CREATE SEQUENCE governance_label_seq_seq AS bigint`.execute(db);

  // Add the column with default from the sequence
  await sql`
    ALTER TABLE governance_label
      ADD COLUMN seq bigint NOT NULL DEFAULT nextval('governance_label_seq_seq')
  `.execute(db);

  // Make the sequence owned by the column (so it's dropped with the column)
  await sql`
    ALTER SEQUENCE governance_label_seq_seq OWNED BY governance_label.seq
  `.execute(db);

  // Backfill existing rows (order by created_at so seq reflects chronological order)
  await sql`
    WITH numbered AS (
      SELECT id, row_number() OVER (ORDER BY created_at) AS rn
      FROM governance_label
    )
    UPDATE governance_label SET seq = numbered.rn
    FROM numbered WHERE governance_label.id = numbered.id
  `.execute(db);

  // Reset sequence to continue after the highest backfilled value.
  // Use GREATEST(..., 1) because setval does not accept 0 (min is 1).
  await sql`
    SELECT setval('governance_label_seq_seq', GREATEST(COALESCE((SELECT MAX(seq) FROM governance_label), 1), 1))
  `.execute(db);

  await sql`
    CREATE INDEX idx_governance_label_seq
      ON governance_label (seq)
  `.execute(db);

  await sql`
    CREATE INDEX idx_governance_label_src_did
      ON governance_label (src_did)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_governance_label_src_did`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_governance_label_seq`.execute(db);
  await sql`ALTER TABLE governance_label DROP COLUMN seq`.execute(db);
  // Sequence is automatically dropped because it's OWNED BY the column
}
