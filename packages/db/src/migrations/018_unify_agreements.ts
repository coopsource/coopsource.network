import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 018 — Unify agreement systems
 *
 * Merges the v2 `agreement` table (UUID PK, signing workflow) and
 * `master_agreement` table (URI PK, structured governance) into one
 * unified `agreement` table using master_agreement's richer data model
 * as the base and adding v2's signing workflow.
 *
 * Also creates `agreement_revision` for immutability / audit trail.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── 1. Drop old v2 tables ────────────────────────────────────────────

  // Drop the unique constraint on agreement_signature referencing old agreement.id
  await sql`ALTER TABLE agreement_signature DROP CONSTRAINT IF EXISTS agreement_signature_agreement_signer_unique`.execute(db);
  await sql`ALTER TABLE agreement_signature DROP CONSTRAINT IF EXISTS agreement_signature_agreement_id_fkey`.execute(db);
  await sql`ALTER TABLE agreement_signature DROP CONSTRAINT IF EXISTS agreement_signature_signer_did_fkey`.execute(db);
  await sql`ALTER TABLE agreement_signature DROP CONSTRAINT IF EXISTS agreement_signature_retracted_by_fkey`.execute(db);

  // Drop agreement_party (parties now tracked via stakeholder_terms)
  await db.schema.dropTable('agreement_party').ifExists().execute();

  // Drop the old v2 agreement table (UUID-based)
  // First drop FKs pointing to it
  await sql`ALTER TABLE agreement DROP CONSTRAINT IF EXISTS agreement_cooperative_did_fkey`.execute(db);
  await sql`ALTER TABLE agreement DROP CONSTRAINT IF EXISTS agreement_created_by_fkey`.execute(db);
  await sql`ALTER TABLE agreement DROP CONSTRAINT IF EXISTS agreement_invalidated_by_fkey`.execute(db);
  await db.schema.dropTable('agreement').ifExists().execute();

  // ── 2. Rename master_agreement → agreement ───────────────────────────

  await sql`ALTER TABLE master_agreement RENAME TO agreement`.execute(db);
  await sql`ALTER INDEX idx_master_agreement_did_project RENAME TO idx_agreement_did_project`.execute(db);

  // ── 3. Add v2 columns to the renamed agreement table ─────────────────

  await sql`ALTER TABLE agreement ADD COLUMN body text`.execute(db);
  await sql`ALTER TABLE agreement ADD COLUMN body_format text NOT NULL DEFAULT 'markdown'`.execute(db);
  await sql`ALTER TABLE agreement ADD COLUMN created_by text NOT NULL DEFAULT ''`.execute(db);

  // Set created_by from existing `did` column for existing rows
  await sql`UPDATE agreement SET created_by = did WHERE created_by = ''`.execute(db);

  // Add status values for the unified lifecycle
  // Drop old check constraint if any, then add new one
  // (master_agreement had no check constraint, so just add one)
  await sql`
    ALTER TABLE agreement DROP CONSTRAINT IF EXISTS agreement_status_check
  `.execute(db);

  // ── 4. Update stakeholder_terms column name ──────────────────────────

  await sql`ALTER TABLE stakeholder_terms RENAME COLUMN master_agreement_uri TO agreement_uri`.execute(db);
  await sql`ALTER INDEX idx_stakeholder_terms_agreement RENAME TO idx_stakeholder_terms_agreement_uri`.execute(db);
  await sql`ALTER INDEX idx_stakeholder_terms_agreement_stakeholder RENAME TO idx_stakeholder_terms_agreement_stakeholder_uri`.execute(db);

  // ── 5. Update agreement_signature for URI-based agreements ───────────

  // The old agreement_signature had agreement_id (UUID FK to old agreement).
  // We keep the column but make it nullable (no longer FK'd).
  // Add agreement_uri column for looking up by URI.
  await sql`ALTER TABLE agreement_signature ALTER COLUMN agreement_id DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE agreement_signature ALTER COLUMN agreement_uri TYPE text`.execute(db);

  // Create a unique index for URI-based signature lookups
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agreement_signature_uri_signer_active
    ON agreement_signature (agreement_uri, signer_did)
    WHERE retracted_at IS NULL
  `.execute(db);

  // ── 6. Create agreement_revision table ───────────────────────────────

  await db.schema
    .createTable('agreement_revision')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('agreement_uri', 'text', (col) => col.notNull())
    .addColumn('revision_number', 'integer', (col) => col.notNull())
    .addColumn('changed_by', 'text', (col) => col.notNull())
    .addColumn('change_type', 'text', (col) => col.notNull())
    .addColumn('field_changes', 'jsonb')
    .addColumn('snapshot', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_agreement_revision_uri')
    .on('agreement_revision')
    .columns(['agreement_uri'])
    .execute();

  await db.schema
    .createIndex('idx_agreement_revision_uri_number')
    .on('agreement_revision')
    .columns(['agreement_uri', 'revision_number'])
    .unique()
    .execute();

  // ── 7. Add performance indexes ───────────────────────────────────────

  await sql`
    CREATE INDEX IF NOT EXISTS idx_agreement_status
    ON agreement (status)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_agreement_created_at
    ON agreement (created_at DESC)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop new tables/indexes
  await db.schema.dropTable('agreement_revision').ifExists().execute();

  await sql`DROP INDEX IF EXISTS idx_agreement_status`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_agreement_created_at`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_agreement_signature_uri_signer_active`.execute(db);

  // Rename back
  await sql`ALTER TABLE stakeholder_terms RENAME COLUMN agreement_uri TO master_agreement_uri`.execute(db);
  await sql`ALTER INDEX idx_stakeholder_terms_agreement_uri RENAME TO idx_stakeholder_terms_agreement`.execute(db);
  await sql`ALTER INDEX idx_stakeholder_terms_agreement_stakeholder_uri RENAME TO idx_stakeholder_terms_agreement_stakeholder`.execute(db);

  // Drop added columns
  await sql`ALTER TABLE agreement DROP COLUMN IF EXISTS body`.execute(db);
  await sql`ALTER TABLE agreement DROP COLUMN IF EXISTS body_format`.execute(db);
  await sql`ALTER TABLE agreement DROP COLUMN IF EXISTS created_by`.execute(db);

  // Rename agreement back to master_agreement
  await sql`ALTER TABLE agreement RENAME TO master_agreement`.execute(db);
  await sql`ALTER INDEX idx_agreement_did_project RENAME TO idx_master_agreement_did_project`.execute(db);

  // Note: cannot restore the old v2 agreement and agreement_party tables in down migration
  // This is a one-way merge for pre-release.
}
