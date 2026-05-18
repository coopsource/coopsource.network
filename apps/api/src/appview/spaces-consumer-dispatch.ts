import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { CsnDbGroupAuthorityPort } from '@coopsource/arbiter-client';
import {
  InMemoryPermissionedRepoPort,
  KyselyPermissionedCheckpointStore,
  SpacesConsumer,
  type ConsumerHealth,
  type PermissionedVerificationStatus,
  type SpaceRef,
  type VerifiedPermissionedRecord,
} from '@coopsource/spaces-consumer';
import { logger } from '../middleware/logger.js';

export interface SpacesConsumerDispatchConfig {
  readonly enabled: boolean;
  readonly unsafeAcceptUnverifiedPermissionedData: boolean;
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

  if (activeConsumer) {
    logger.warn('startSpacesConsumer called twice; ignoring (existing consumer remains active)');
    return activeConsumer;
  }

  if (cfg.unsafeAcceptUnverifiedPermissionedData && process.env.NODE_ENV === 'production') {
    throw new Error(
      'UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA cannot be set in production.',
    );
  }

  const verification: PermissionedVerificationStatus = cfg.unsafeAcceptUnverifiedPermissionedData
    ? 'unverified-dev-mode'
    : 'failed-closed';

  if (cfg.unsafeAcceptUnverifiedPermissionedData) {
    logger.warn(
      'UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA=true — permissioned repo verification DISABLED. ' +
        'Never run with this flag in production.',
    );
  }

  const consumer = new SpacesConsumer({
    groupAuthority: new CsnDbGroupAuthorityPort(cfg.db),
    permissionedRepo: new InMemoryPermissionedRepoPort({
      records: [],
      verification,
      checkpoints: new KyselyPermissionedCheckpointStore(cfg.db),
      clock: () => new Date(),
    }),
    onAccepted: async (record: VerifiedPermissionedRecord) => {
      logger.info(
        { location: record.location, cid: record.cid },
        'spaces-consumer: accepted record (stage 1: log-only)',
      );
    },
    onRejected: async ({ record, reason }) => {
      logger.warn(
        { location: record.location, cid: record.cid, reason },
        'spaces-consumer: rejected verified record (stage 1: log-only)',
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
      verification,
      groupAuthority: 'CsnDbGroupAuthorityPort',
    },
    'Spaces consumer started (stage 2A: CSN DB authority adapter, log-only record handling)',
  );
  return consumer;
}

export async function stopSpacesConsumer(): Promise<void> {
  if (!activeConsumer) return;
  await activeConsumer.stop();
  activeConsumer = null;
  logger.info('Spaces consumer stopped');
}

export function getSpacesConsumerHealth(): ConsumerHealth | null {
  return activeConsumer?.health() ?? null;
}
