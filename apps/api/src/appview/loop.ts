import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IPdsService } from '@coopsource/federation';
import { logger } from '../middleware/logger.js';
import {
  indexMembership,
  indexMemberApproval,
} from './indexers/membership-indexer.js';
import { indexProposal, indexVote } from './indexers/proposal-indexer.js';
import {
  indexAgreement,
  indexSignature,
} from './indexers/agreement-indexer.js';
import {
  indexInterest,
  indexOutcome,
  indexInterestMap,
} from './indexers/alignment-indexer.js';

const SUBSCRIBER_ID = 'appview';
const MAX_BACKOFF_MS = 30_000;

function collectionFromUri(uri: string): string {
  // at://did/collection/rkey → collection
  const withoutScheme = uri.replace('at://', '');
  const parts = withoutScheme.split('/');
  return parts[1] ?? '';
}

export async function startAppViewLoop(
  pdsService: IPdsService,
  db: Kysely<Database>,
): Promise<void> {
  // Ensure cursor row exists
  const existing = await db
    .selectFrom('pds_firehose_cursor')
    .where('subscriber_id', '=', SUBSCRIBER_ID)
    .select('last_global_seq')
    .executeTakeFirst();

  let cursor: number;
  if (!existing) {
    await db
      .insertInto('pds_firehose_cursor')
      .values({
        subscriber_id: SUBSCRIBER_ID,
        last_global_seq: 0,
        updated_at: new Date(),
      })
      .execute();
    cursor = 0;
  } else {
    cursor = existing.last_global_seq;
  }

  logger.info({ cursor }, 'AppView loop starting');
  runLoop(pdsService, db, cursor);
}

async function runLoop(
  pdsService: IPdsService,
  db: Kysely<Database>,
  cursor: number,
): Promise<void> {
  let backoff = 1000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const stream = pdsService.subscribeRepos(cursor);

      for await (const event of stream) {
        try {
          const collection = collectionFromUri(event.uri);

          switch (collection) {
            case 'network.coopsource.org.membership':
              await indexMembership(db, event);
              break;
            case 'network.coopsource.org.memberApproval':
              await indexMemberApproval(db, event);
              break;
            case 'network.coopsource.governance.proposal':
              await indexProposal(db, event);
              break;
            case 'network.coopsource.governance.vote':
              await indexVote(db, event);
              break;
            case 'network.coopsource.agreement.master':
              await indexAgreement(db, event);
              break;
            case 'network.coopsource.agreement.signature':
              await indexSignature(db, event);
              break;
            case 'network.coopsource.alignment.interest':
              await indexInterest(db, event);
              break;
            case 'network.coopsource.alignment.outcome':
              await indexOutcome(db, event);
              break;
            case 'network.coopsource.alignment.interestMap':
              await indexInterestMap(db, event);
              break;
            default:
              // Unknown collection — skip
              break;
          }

          // Update cursor
          cursor = event.seq;
          await db
            .updateTable('pds_firehose_cursor')
            .set({
              last_global_seq: event.seq,
              updated_at: new Date(),
            })
            .where('subscriber_id', '=', SUBSCRIBER_ID)
            .execute();

          // Reset backoff on successful processing
          backoff = 1000;
        } catch (err) {
          logger.error(
            { err, event: { seq: event.seq, uri: event.uri } },
            'AppView indexer error',
          );
        }
      }
    } catch (err) {
      logger.error({ err, backoff }, 'AppView loop error, retrying');
      await new Promise((resolve) => setTimeout(resolve, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  }
}
