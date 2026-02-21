import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Fix vote UNIQUE constraint: allow re-voting after soft-delete (retracted_at)
  await sql`ALTER TABLE vote DROP CONSTRAINT IF EXISTS vote_proposal_voter_unique`.execute(db);
  await sql`
    CREATE UNIQUE INDEX vote_proposal_voter_active
    ON vote (proposal_id, voter_did)
    WHERE retracted_at IS NULL
  `.execute(db);

  // Fix agreement_signature UNIQUE constraint: allow re-signing after retraction
  await sql`ALTER TABLE agreement_signature DROP CONSTRAINT IF EXISTS agreement_signature_agreement_signer_unique`.execute(db);
  await sql`
    CREATE UNIQUE INDEX agreement_sig_active
    ON agreement_signature (agreement_id, signer_did)
    WHERE retracted_at IS NULL
  `.execute(db);

  // Performance indexes for hot paths
  await sql`CREATE INDEX IF NOT EXISTS idx_membership_member_did ON membership (member_did) WHERE invalidated_at IS NULL`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_auth_credential_identifier ON auth_credential (identifier)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_invitation_token ON invitation (token)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_proposal_coop_status ON proposal (cooperative_did, status) WHERE invalidated_at IS NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Remove performance indexes
  await sql`DROP INDEX IF EXISTS idx_proposal_coop_status`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_invitation_token`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_auth_credential_identifier`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_membership_member_did`.execute(db);

  // Restore original agreement_signature unique constraint
  await sql`DROP INDEX IF EXISTS agreement_sig_active`.execute(db);
  await sql`
    ALTER TABLE agreement_signature
    ADD CONSTRAINT agreement_signature_agreement_signer_unique
    UNIQUE (agreement_id, signer_did)
  `.execute(db);

  // Restore original vote unique constraint
  await sql`DROP INDEX IF EXISTS vote_proposal_voter_active`.execute(db);
  await sql`
    ALTER TABLE vote
    ADD CONSTRAINT vote_proposal_voter_unique
    UNIQUE (proposal_id, voter_did)
  `.execute(db);
}
