import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IPdsService, FirehoseEvent } from '@coopsource/federation';
import type { DID, AtUri, CID } from '@coopsource/common';
import { Tap, SimpleIndexer } from '@atproto/tap';
import type { RecordEvent } from '@atproto/tap';
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
import { collectionFromUri } from './utils.js';
import type { HookRegistry } from './hooks/registry.js';
import { processFirehoseEvent } from './hooks/pipeline.js';
import { getValidationWarnings } from './hooks/pipeline.js';

export interface AppViewConfig {
  tapUrl?: string;
  hookRegistry?: HookRegistry;
}

// ─── Firehose health state (exported for health endpoint) ──────────────────

export interface FirehoseHealth {
  mode: 'tap' | 'local';
  lastSeq: number;
  lastEventAt: string | null;
  errorCount: number;
  validationWarnings: number;
  startedAt: string;
}

const healthState: Omit<FirehoseHealth, 'validationWarnings'> = {
  mode: 'local',
  lastSeq: 0,
  lastEventAt: null,
  errorCount: 0,
  startedAt: new Date().toISOString(),
};

export function getFirehoseHealth(): FirehoseHealth {
  return { ...healthState, validationWarnings: getValidationWarnings() };
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

// ─── Convert Tap RecordEvent to our FirehoseEvent ─────────────────────────

function tapEventToFirehoseEvent(evt: RecordEvent): FirehoseEvent {
  return {
    seq: evt.id,
    did: evt.did as DID,
    operation: evt.action,
    uri: `at://${evt.did}/${evt.collection}/${evt.rkey}` as AtUri,
    cid: (evt.cid ?? '') as CID,
    record: evt.record as Record<string, unknown> | undefined,
    time: new Date().toISOString(),
  };
}

// ─── AppView loop ──────────────────────────────────────────────────────────

const MAX_BACKOFF_MS = 30_000;

export async function startAppViewLoop(
  pdsService: IPdsService,
  db: Kysely<Database>,
  config: AppViewConfig = {},
): Promise<void> {
  // Mode: TAP_URL → Tap client, otherwise local pg_notify fallback
  const mode = config.tapUrl ? 'tap' : 'local';

  healthState.mode = mode;
  healthState.startedAt = new Date().toISOString();

  logger.info({ mode, tapUrl: config.tapUrl }, 'AppView loop starting');

  if (mode === 'tap') {
    runTapLoop(db, config).catch((err) => {
      logger.error(err, 'Tap loop fatal error');
    });
  } else {
    // Ensure cursor row exists for local mode
    const subscriberId = 'appview-local';
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

    runLocalLoop(pdsService, db, cursor, config).catch((err) => {
      logger.error(err, 'Local loop fatal error');
    });
  }
}

// ─── Tap loop (using @atproto/tap client) ─────────────────────────────────

async function runTapLoop(
  db: Kysely<Database>,
  config: AppViewConfig,
): Promise<void> {
  const tap = new Tap(config.tapUrl!);
  const indexer = new SimpleIndexer();

  indexer.record(async (evt) => {
    try {
      const firehoseEvent = tapEventToFirehoseEvent(evt);
      if (config.hookRegistry) {
        await processFirehoseEvent(db, config.hookRegistry, firehoseEvent);
      } else {
        await dispatchFirehoseEvent(db, firehoseEvent);
      }

      healthState.lastSeq = evt.id;
      healthState.lastEventAt = new Date().toISOString();
    } catch (err) {
      healthState.errorCount++;
      logger.error(
        { err, event: { id: evt.id, collection: evt.collection, did: evt.did } },
        'AppView indexer error (tap)',
      );
    }
  });

  indexer.error((err) => {
    healthState.errorCount++;
    logger.error({ err }, 'Tap indexer error');
  });

  const channel = tap.channel(indexer);
  await channel.start();

  logger.info({ tapUrl: config.tapUrl }, 'Tap channel started');
}

// ─── Local loop (pg_notify fallback for dev) ──────────────────────────────

async function runLocalLoop(
  pdsService: IPdsService,
  db: Kysely<Database>,
  cursor: number,
  config: AppViewConfig = {},
): Promise<void> {
  const subscriberId = 'appview-local';
  let backoff = 1000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const stream = pdsService.subscribeRepos(cursor);

      for await (const event of stream) {
        try {
          if (config.hookRegistry) {
            await processFirehoseEvent(db, config.hookRegistry, event);
          } else {
            await dispatchFirehoseEvent(db, event);
          }

          // Update cursor
          await db
            .updateTable('pds_firehose_cursor')
            .set({
              last_global_seq: event.seq,
              updated_at: new Date(),
            })
            .where('subscriber_id', '=', subscriberId)
            .execute();

          healthState.lastSeq = event.seq;
          healthState.lastEventAt = new Date().toISOString();

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
