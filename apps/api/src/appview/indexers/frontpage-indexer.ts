import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';

/**
 * Index Frontpage posts that reference governance proposals.
 * Collection: fyi.unravel.frontpage.post
 */
export async function indexFrontpagePost(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  if (event.operation === 'delete') {
    await db
      .deleteFrom('frontpage_post_ref')
      .where('post_uri', '=', event.uri)
      .execute();
    return;
  }

  const record = event.record;
  if (!record) return;

  // Extract proposal reference if present
  const proposalUri = typeof record.proposalUri === 'string' ? record.proposalUri : null;
  const title = typeof record.title === 'string' ? record.title : null;

  await db
    .insertInto('frontpage_post_ref')
    .values({
      post_uri: event.uri,
      proposal_uri: proposalUri,
      cooperative_did: event.did,
      title,
      indexed_at: new Date(),
    })
    .onConflict((oc) =>
      oc.column('post_uri').doUpdateSet({
        proposal_uri: proposalUri,
        title,
        indexed_at: new Date(),
      }),
    )
    .execute();
}
