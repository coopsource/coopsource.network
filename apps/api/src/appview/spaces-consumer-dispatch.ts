import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import {
  SpacesConsumer,
  KyselyCursorStore,
  InMemoryNotificationSubscriber, // sketch — Stage 2+ provides a real subscriber
  DenyAllArbiterMemberList, // fail-closed default — Stage 2 provides real
  InMemoryRepoPuller, // sketch — real impl wraps @atproto/sync
  FailClosedEcmhVerifier, // fail-closed default — gated on ECMH spec
  UnsafeAlwaysOkEcmhVerifier, // test/dev-only; opt-in via UNSAFE_SKIP_ECMH
  type EcmhVerifier,
  type ConsumerHealth,
  type SpaceRef,
  type PulledRecord,
} from '@coopsource/spaces-consumer';
import { logger } from '../middleware/logger.js';

export interface SpacesConsumerDispatchConfig {
  readonly enabled: boolean;
  readonly unsafeSkipEcmh: boolean;
  readonly db: Kysely<Database>;
  readonly spaces: ReadonlyArray<SpaceRef>;
}

let activeConsumer: SpacesConsumer | null = null;

export async function startSpacesConsumer(
  cfg: SpacesConsumerDispatchConfig,
): Promise<SpacesConsumer | null> {
  if (!cfg.enabled) {
    logger.info('Spaces consumer disabled by config (SPACES_CONSUMER_ENABLED=false)');
    return null;
  }

  let verifier: EcmhVerifier = new FailClosedEcmhVerifier();
  if (cfg.unsafeSkipEcmh) {
    logger.warn(
      'UNSAFE_SKIP_ECMH=true — ECMH digest verification DISABLED. ' +
        'Never run with this flag in production.',
    );
    verifier = new UnsafeAlwaysOkEcmhVerifier();
  }

  const consumer = new SpacesConsumer({
    subscriber: new InMemoryNotificationSubscriber({ clock: () => new Date() }),
    memberList: new DenyAllArbiterMemberList(), // fail-closed default; Stage 2 wires real arbiter
    puller: new InMemoryRepoPuller([]), // sketch only; never fires against real data in Stage 1
    verifier,
    cursors: new KyselyCursorStore(cfg.db),
    onAccepted: async (r: PulledRecord) => {
      // Stage 1 logs only. Adaptation to the hook pipeline's FirehoseEvent shape
      // (see loop.ts -> processFirehoseEvent) is deferred to when a real RepoPuller
      // produces real records (Stage 2+).
      logger.info(
        { uri: r.uri, author: r.authorDid, space: r.space },
        'spaces-consumer: accepted record (stage 1: log-only)',
      );
    },
    onError: async (err, ctx) => {
      logger.warn({ err, ctx }, 'spaces-consumer: handler error');
    },
    clock: () => new Date(),
  });

  await consumer.start(cfg.spaces);
  activeConsumer = consumer;
  logger.info(
    {
      spaces: cfg.spaces.length,
      verifier: cfg.unsafeSkipEcmh ? 'UnsafeAlwaysOk' : 'FailClosed',
      memberList: 'DenyAll (sketch)',
    },
    'Spaces consumer started',
  );
  return consumer;
}

export function getSpacesConsumerHealth(): ConsumerHealth | null {
  return activeConsumer?.health() ?? null;
}
