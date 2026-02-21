import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';
import { emitAppEvent } from '../sse.js';

export async function indexMembership(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  const record = event.record as
    | { cooperative?: string; createdAt?: string }
    | undefined;
  const cooperativeDid = record?.cooperative;
  if (!cooperativeDid && event.operation !== 'delete') return;

  const existing = await db
    .selectFrom('membership')
    .where('member_did', '=', event.did)
    .where(
      'cooperative_did',
      '=',
      cooperativeDid ?? '',
    )
    .where('invalidated_at', 'is', null)
    .selectAll()
    .executeTakeFirst();

  if (event.operation === 'delete') {
    if (!existing) return;
    await db
      .updateTable('membership')
      .set({
        status: 'departed',
        departed_at: new Date(),
        invalidated_at: new Date(),
        indexed_at: new Date(),
      })
      .where('id', '=', existing.id)
      .execute();
    emitAppEvent({
      type: 'member.departed',
      data: { did: event.did },
      cooperativeDid: existing.cooperative_did,
    });
    return;
  }

  if (existing) {
    const isNowActive = existing.approval_record_uri != null;
    await db
      .updateTable('membership')
      .set({
        member_record_uri: event.uri,
        member_record_cid: event.cid,
        status: isNowActive ? 'active' : 'pending',
        joined_at: isNowActive ? new Date() : existing.joined_at,
        indexed_at: new Date(),
      })
      .where('id', '=', existing.id)
      .execute();
    if (isNowActive) {
      emitAppEvent({
        type: 'member.joined',
        data: { did: event.did },
        cooperativeDid: existing.cooperative_did,
      });
    }
  } else {
    await db
      .insertInto('membership')
      .values({
        member_did: event.did,
        cooperative_did: cooperativeDid!,
        member_record_uri: event.uri,
        member_record_cid: event.cid,
        status: 'pending',
        created_at: new Date(),
        indexed_at: new Date(),
      })
      .execute();
  }
}

export async function indexMemberApproval(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  const record = event.record as
    | { member?: string; roles?: string[] }
    | undefined;
  const memberDid = record?.member;
  if (!memberDid && event.operation !== 'delete') return;

  // The approval is written by the cooperative DID
  const cooperativeDid = event.did;

  const existing = await db
    .selectFrom('membership')
    .where('member_did', '=', memberDid ?? '')
    .where('cooperative_did', '=', cooperativeDid)
    .where('invalidated_at', 'is', null)
    .selectAll()
    .executeTakeFirst();

  if (event.operation === 'delete') {
    if (!existing) return;
    await db
      .updateTable('membership')
      .set({
        status: 'suspended',
        approval_record_uri: null,
        approval_record_cid: null,
        indexed_at: new Date(),
      })
      .where('id', '=', existing.id)
      .execute();
    // Remove roles
    await db
      .deleteFrom('membership_role')
      .where('membership_id', '=', existing.id)
      .execute();
    return;
  }

  const roles = record?.roles ?? [];

  if (existing) {
    const isNowActive = existing.member_record_uri != null;
    await db
      .updateTable('membership')
      .set({
        approval_record_uri: event.uri,
        approval_record_cid: event.cid,
        status: isNowActive ? 'active' : 'pending',
        joined_at: isNowActive ? new Date() : existing.joined_at,
        indexed_at: new Date(),
      })
      .where('id', '=', existing.id)
      .execute();

    // Replace roles
    await db
      .deleteFrom('membership_role')
      .where('membership_id', '=', existing.id)
      .execute();
    if (roles.length > 0) {
      await db
        .insertInto('membership_role')
        .values(
          roles.map((role) => ({
            membership_id: existing.id,
            role,
            indexed_at: new Date(),
          })),
        )
        .execute();
    }

    if (isNowActive) {
      emitAppEvent({
        type: 'member.joined',
        data: { did: memberDid },
        cooperativeDid,
      });
    }
  } else {
    const [row] = await db
      .insertInto('membership')
      .values({
        member_did: memberDid!,
        cooperative_did: cooperativeDid,
        approval_record_uri: event.uri,
        approval_record_cid: event.cid,
        status: 'pending',
        created_at: new Date(),
        indexed_at: new Date(),
      })
      .returning('id')
      .execute();

    if (roles.length > 0 && row) {
      await db
        .insertInto('membership_role')
        .values(
          roles.map((role) => ({
            membership_id: row.id,
            role,
            indexed_at: new Date(),
          })),
        )
        .execute();
    }
  }
}
