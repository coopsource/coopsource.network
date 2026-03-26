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
import { subscribeTap } from './tap-consumer.js';
import { verifyCommitSignature } from './commit-verifier.js';
import { collectionFromUri } from './utils.js';

const COLLECTION_PREFIXES = [
  'network.coopsource.',
  'community.lexicon.calendar.',
  'fyi.unravel.frontpage.',
];

const MAX_BACKOFF_MS = 30_000;

export interface AppViewConfig {
  tapUrl?: string;
  relayUrl?: string;
  verifySignatures?: boolean;
}

// ─── Firehose health state (exported for health endpoint) ──────────────────

export interface FirehoseHealth {
  mode: 'tap' | 'relay' | 'local';
  lastSeq: number;
  lastEventAt: string | null;
  errorCount: number;
  startedAt: string;
}

const healthState: FirehoseHealth = {
  mode: 'local',
  lastSeq: 0,
  lastEventAt: null,
  errorCount: 0,
  startedAt: new Date().toISOString(),
};

export function getFirehoseHealth(): FirehoseHealth {
  return { ...healthState };
}

// ─── Dispatch ──────────────────────────────────────────────────────────────

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
    case 'community.lexicon.calendar.event':
      await indexCalendarEvent(db, event);
      break;
    case 'community.lexicon.calendar.rsvp':
      await indexCalendarRsvp(db, event);
      break;
    case 'fyi.unravel.frontpage.post':
      await indexFrontpagePost(db, event);
      break;
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
      break;
  }
}

// ─── AppView loop ──────────────────────────────────────────────────────────

export async function startAppViewLoop(
  pdsService: IPdsService,
  db: Kysely<Database>,
  config: AppViewConfig = {},
): Promise<void> {
  // Mode priority: TAP_URL > RELAY_URL > local pg_notify
  const mode = config.tapUrl ? 'tap' : config.relayUrl ? 'relay' : 'local';
  const subscriberId = `appview-${mode}`;

  healthState.mode = mode;
  healthState.startedAt = new Date().toISOString();

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

  logger.info({ cursor, mode }, 'AppView loop starting');

  switch (mode) {
    case 'tap':
      runTapLoop(db, cursor, config).catch((err) => {
        logger.error(err, 'Tap loop fatal error');
      });
      break;
    case 'relay':
      runRelayLoop(db, cursor, config).catch((err) => {
        logger.error(err, 'Relay loop fatal error');
      });
      break;
    default:
      runLocalLoop(pdsService, db, cursor, config).catch((err) => {
        logger.error(err, 'Local loop fatal error');
      });
      break;
  }
}

// ─── Shared event processing ───────────────────────────────────────────────

async function processEvent(
  db: Kysely<Database>,
  event: FirehoseEvent,
  subscriberId: string,
  config: AppViewConfig,
): Promise<void> {
  // Signature verification (all records when enabled, not just membership)
  if (config.verifySignatures && event.commitSig && event.commitSignedBytes) {
    const valid = await verifyCommitSignature({
      did: event.did,
      sig: event.commitSig,
      signedBytes: event.commitSignedBytes,
    });
    if (!valid) {
      logger.warn(
        { uri: event.uri, did: event.did },
        'Commit signature verification failed — indexing anyway (best-effort)',
      );
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

  // Update health state
  healthState.lastSeq = event.seq;
  healthState.lastEventAt = new Date().toISOString();
}

// ─── Tap loop ──────────────────────────────────────────────────────────────

async function runTapLoop(
  db: Kysely<Database>,
  cursor: number,
  config: AppViewConfig,
): Promise<void> {
  const subscriberId = 'appview-tap';
  const stream = subscribeTap({ tapUrl: config.tapUrl!, cursor });

  for await (const event of stream) {
    try {
      await processEvent(db, event, subscriberId, config);
    } catch (err) {
      healthState.errorCount++;
      logger.error(
        { err, event: { seq: event.seq, uri: event.uri } },
        'AppView indexer error (tap)',
      );
    }
  }
}

// ─── Relay loop ────────────────────────────────────────────────────────────

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
      await processEvent(db, event, subscriberId, config);
    } catch (err) {
      healthState.errorCount++;
      logger.error(
        { err, event: { seq: event.seq, uri: event.uri } },
        'AppView indexer error (relay)',
      );
    }
  }
}

// ─── Local loop ────────────────────────────────────────────────────────────

async function runLocalLoop(
  pdsService: IPdsService,
  db: Kysely<Database>,
  cursor: number,
  config: AppViewConfig,
): Promise<void> {
  const subscriberId = 'appview-local';
  let backoff = 1000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const stream = pdsService.subscribeRepos(cursor);

      for await (const event of stream) {
        try {
          await processEvent(db, event, subscriberId, config);
          cursor = event.seq;
          backoff = 1000;
        } catch (err) {
          healthState.errorCount++;
          logger.error(
            { err, event: { seq: event.seq, uri: event.uri } },
            'AppView indexer error (local)',
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
