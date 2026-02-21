import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';
import { emitAppEvent } from '../sse.js';

export async function indexProposal(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  if (event.operation === 'delete') {
    // Soft-delete: mark invalidated
    await db
      .updateTable('proposal')
      .set({ invalidated_at: new Date(), indexed_at: new Date() })
      .where('uri', '=', event.uri)
      .execute();
    return;
  }

  const record = event.record as Record<string, unknown> | undefined;
  if (!record) return;

  const existing = await db
    .selectFrom('proposal')
    .where('uri', '=', event.uri)
    .select('id')
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('proposal')
      .set({
        cid: event.cid,
        title: record.title as string,
        body: record.body as string,
        indexed_at: new Date(),
      })
      .where('id', '=', existing.id)
      .execute();
  }
  // Note: proposals are typically inserted directly by ProposalService,
  // but the indexer handles cases where records arrive via firehose
}

export async function indexVote(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  if (event.operation === 'delete') {
    await db
      .updateTable('vote')
      .set({ retracted_at: new Date(), retracted_by: event.did })
      .where('uri', '=', event.uri)
      .execute();

    emitAppEvent({
      type: 'vote.retracted',
      data: { voterDid: event.did, uri: event.uri },
      cooperativeDid: '', // will be filtered client-side
    });
    return;
  }

  const record = event.record as Record<string, unknown> | undefined;
  if (!record) return;

  // Look up proposal by URI
  const proposal = await db
    .selectFrom('proposal')
    .where('uri', '=', (record.proposal as string) ?? '')
    .select(['id', 'cooperative_did'])
    .executeTakeFirst();

  if (!proposal) return; // Proposal not yet indexed

  // Check for existing vote and retract it
  await db
    .updateTable('vote')
    .set({ retracted_at: new Date(), retracted_by: event.did })
    .where('proposal_id', '=', proposal.id)
    .where('voter_did', '=', event.did)
    .where('retracted_at', 'is', null)
    .execute();

  await db
    .insertInto('vote')
    .values({
      uri: event.uri,
      cid: event.cid,
      proposal_id: proposal.id,
      proposal_uri: (record.proposal as string) ?? '',
      proposal_cid: (record.proposalCid as string) ?? '',
      voter_did: event.did,
      choice: (record.choice as string) ?? '',
      rationale: (record.rationale as string) ?? null,
      created_at: new Date(),
      indexed_at: new Date(),
    })
    .onConflict((oc) => oc.column('uri').doUpdateSet({ cid: event.cid, indexed_at: new Date() }))
    .execute();

  emitAppEvent({
    type: 'vote.cast',
    data: {
      voterDid: event.did,
      proposalId: proposal.id,
      choice: record.choice,
    },
    cooperativeDid: proposal.cooperative_did,
  });
}
