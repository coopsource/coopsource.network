import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';

// The consentType values the memberConsent lexicon defines. A firehose record
// with anything else is not valid consent evidence and must not overwrite the
// projected pointer (which may hold a join-verified reference).
const VALID_CONSENT_TYPES = new Set([
  'joinRequest',
  'invitationAcceptance',
  'bootstrapOwner',
  'networkJoin',
]);

export async function indexMemberConsent(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  const record = event.record as
    | { cooperative?: string; consentType?: string; createdAt?: string }
    | undefined;
  const cooperativeDid = record?.cooperative;

  if (event.operation === 'delete') {
    // The firehose sets cid='' on deletes (op.cid is null), so the pointer must
    // be cleared by (author, uri), NOT by cid — matching on the empty cid never
    // hit any row and left the projection permanently stale.
    await db
      .updateTable('membership')
      .set({
        member_record_uri: null,
        member_record_cid: null,
        indexed_at: new Date(),
      })
      .where('member_did', '=', event.did)
      .where('member_record_uri', '=', event.uri)
      .execute();
    return;
  }

  if (!cooperativeDid) return;

  // Evidence integrity: only a record whose consentType is valid may overwrite
  // the projected pointer, so a member cannot replace their join-verified
  // consent reference with an arbitrary self-published record. (Full
  // re-verification — resolution + CID match + timestamp plausibility via
  // consentEvidenceVerifier — is a follow-up once the verifier is available in
  // the hook context; consentType validity is the inline floor.)
  if (!record?.consentType || !VALID_CONSENT_TYPES.has(record.consentType)) {
    return;
  }

  await db
    .updateTable('membership')
    .set({
      member_record_uri: event.uri,
      member_record_cid: event.cid,
      indexed_at: new Date(),
    })
    .where('member_did', '=', event.did)
    .where('cooperative_did', '=', cooperativeDid)
    .where('invalidated_at', 'is', null)
    .execute();
}

export async function indexMemberApproval(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  void db;
  void event;
}
