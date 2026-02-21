import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';
import { emitAppEvent } from '../sse.js';

export async function indexAgreement(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  if (event.operation === 'delete') {
    await db
      .updateTable('agreement')
      .set({ invalidated_at: new Date(), indexed_at: new Date() })
      .where('uri', '=', event.uri)
      .execute();
    return;
  }

  const record = event.record as Record<string, unknown> | undefined;
  if (!record) return;

  const existing = await db
    .selectFrom('agreement')
    .where('uri', '=', event.uri)
    .select('id')
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('agreement')
      .set({
        cid: event.cid,
        title: record.title as string,
        body: record.body as string,
        indexed_at: new Date(),
      })
      .where('id', '=', existing.id)
      .execute();
  }
  // Note: agreements are typically inserted directly by AgreementServiceV2
}

export async function indexSignature(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  if (event.operation === 'delete') {
    await db
      .updateTable('agreement_signature')
      .set({ retracted_at: new Date(), retracted_by: event.did })
      .where('uri', '=', event.uri)
      .execute();
    return;
  }

  const record = event.record as Record<string, unknown> | undefined;
  if (!record) return;

  const agreement = await db
    .selectFrom('agreement')
    .where('uri', '=', (record.agreement as string) ?? '')
    .select(['id', 'cooperative_did'])
    .executeTakeFirst();

  if (!agreement) return; // Agreement not yet indexed

  await db
    .insertInto('agreement_signature')
    .values({
      uri: event.uri,
      cid: event.cid,
      agreement_id: agreement.id,
      agreement_uri: (record.agreement as string) ?? '',
      agreement_cid: (record.agreementCid as string) ?? '',
      signer_did: event.did,
      statement: (record.statement as string) ?? null,
      signed_at: new Date(),
      created_at: new Date(),
      indexed_at: new Date(),
    })
    .onConflict((oc) => oc.column('uri').doUpdateSet({ cid: event.cid, indexed_at: new Date() }))
    .execute();

  emitAppEvent({
    type: 'agreement.signed',
    data: {
      signerDid: event.did,
      agreementId: agreement.id,
    },
    cooperativeDid: agreement.cooperative_did,
  });
}
