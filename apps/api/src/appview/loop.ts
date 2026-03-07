import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IPdsService, FirehoseEvent } from '@coopsource/federation';
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
import { indexCalendarEvent, indexCalendarRsvp } from './indexers/calendar-indexer.js';
import { indexFrontpagePost } from './indexers/frontpage-indexer.js';
import { indexLegalDocument, indexMeetingRecord } from './indexers/legal-indexer.js';
import { indexOfficer, indexComplianceItem, indexMemberNotice, indexFiscalPeriod } from './indexers/admin-indexer.js';
import { subscribeRelay } from './relay-consumer.js';
import { verifyCommitSignature } from './commit-verifier.js';
import { collectionFromUri } from './utils.js';

const COLLECTION_PREFIXES = [
  'network.coopsource.',
  'community.lexicon.calendar.',
  'fyi.unravel.frontpage.',
];

const MAX_BACKOFF_MS = 30_000;

export interface AppViewConfig {
  relayUrl?: string;
  verifySignatures?: boolean;
}

/**
 * Dispatch a single firehose event to the appropriate indexer.
 * Exported for unit testing without a running firehose.
 */
export async function dispatchFirehoseEvent(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
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
    // Ecosystem collections (Phase 3)
    case 'community.lexicon.calendar.event':
      await indexCalendarEvent(db, event);
      break;
    case 'community.lexicon.calendar.rsvp':
      await indexCalendarRsvp(db, event);
      break;
    case 'fyi.unravel.frontpage.post':
      await indexFrontpagePost(db, event);
      break;
    // Legal & Administrative collections (Phase 4)
    case 'network.coopsource.legal.document':
      await indexLegalDocument(db, event);
      break;
    case 'network.coopsource.legal.meetingRecord':
      await indexMeetingRecord(db, event);
      break;
    case 'network.coopsource.admin.officer':
      await indexOfficer(db, event);
      break;
    case 'network.coopsource.admin.complianceItem':
      await indexComplianceItem(db, event);
      break;
    case 'network.coopsource.admin.memberNotice':
      await indexMemberNotice(db, event);
      break;
    case 'network.coopsource.admin.fiscalPeriod':
      await indexFiscalPeriod(db, event);
      break;
    default:
      // Unknown collection — skip
      break;
  }
}

const MEMBERSHIP_COLLECTIONS = new Set([
  'network.coopsource.org.membership',
  'network.coopsource.org.memberApproval',
]);

export async function startAppViewLoop(
  pdsService: IPdsService,
  db: Kysely<Database>,
  config: AppViewConfig = {},
): Promise<void> {
  const subscriberId = config.relayUrl ? 'appview-relay' : 'appview';

  // Ensure cursor row exists
  const existing = await db
    .selectFrom('pds_firehose_cursor')
    .where('subscriber_id', '=', subscriberId)
    .select('last_global_seq')
    .executeTakeFirst();

  let cursor: number;
  if (!existing) {
    await db
      .insertInto('pds_firehose_cursor')
      .values({
        subscriber_id: subscriberId,
        last_global_seq: 0,
        updated_at: new Date(),
      })
      .execute();
    cursor = 0;
  } else {
    cursor = existing.last_global_seq;
  }

  logger.info({ cursor, mode: config.relayUrl ? 'relay' : 'local' }, 'AppView loop starting');

  if (config.relayUrl) {
    runRelayLoop(db, cursor, config).catch((err) => {
      logger.error(err, 'Relay loop fatal error');
    });
  } else {
    runLocalLoop(pdsService, db, cursor, config).catch((err) => {
      logger.error(err, 'Local loop fatal error');
    });
  }
}

async function runRelayLoop(
  db: Kysely<Database>,
  cursor: number,
  config: AppViewConfig,
): Promise<void> {
  const subscriberId = 'appview-relay';
  const stream = subscribeRelay({
    relayUrl: config.relayUrl!,
    collectionPrefixes: COLLECTION_PREFIXES,
    cursor,
  });

  for await (const event of stream) {
    try {
      // Signature verification for membership-critical records
      if (config.verifySignatures && MEMBERSHIP_COLLECTIONS.has(collectionFromUri(event.uri))) {
        if (event.commitSig && event.commitSignedBytes) {
          const valid = await verifyCommitSignature({
            did: event.did,
            sig: event.commitSig,
            signedBytes: event.commitSignedBytes,
          });
          if (!valid) {
            logger.warn({ uri: event.uri, did: event.did }, 'Commit signature verification failed — indexing anyway (best-effort mode)');
          }
        } else {
          logger.debug({ uri: event.uri }, 'No commit signature data available for verification');
        }
      }

      await dispatchFirehoseEvent(db, event);

      // Update cursor
      await db
        .updateTable('pds_firehose_cursor')
        .set({
          last_global_seq: event.seq,
          updated_at: new Date(),
        })
        .where('subscriber_id', '=', subscriberId)
        .execute();
    } catch (err) {
      logger.error(
        { err, event: { seq: event.seq, uri: event.uri } },
        'AppView indexer error (relay)',
      );
    }
  }
}

async function runLocalLoop(
  pdsService: IPdsService,
  db: Kysely<Database>,
  cursor: number,
  _config: AppViewConfig,
): Promise<void> {
  const subscriberId = 'appview';
  let backoff = 1000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const stream = pdsService.subscribeRepos(cursor);

      for await (const event of stream) {
        try {
          await dispatchFirehoseEvent(db, event);

          // Update cursor
          cursor = event.seq;
          await db
            .updateTable('pds_firehose_cursor')
            .set({
              last_global_seq: event.seq,
              updated_at: new Date(),
            })
            .where('subscriber_id', '=', subscriberId)
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
