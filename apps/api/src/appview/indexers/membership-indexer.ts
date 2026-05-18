import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';

export async function indexMembership(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  const record = event.record as
    | { cooperative?: string; createdAt?: string }
    | undefined;
  const cooperativeDid = record?.cooperative;

  if (event.operation === 'delete') {
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
