import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { CsnDbGroupDirectoryPort } from '@coopsource/arbiter-client';
import {
  InMemoryPermissionedRepoPort,
  KyselyDidEquivalencePort,
  KyselyPermissionedCheckpointStore,
  SpacesConsumer,
  type ConsumerHealth,
  type PermissionedVerificationStatus,
  type PermissionedRepoPort,
  type SpaceRef,
  type VerifiedPermissionedRecord,
} from '@coopsource/spaces-consumer';
import { logger } from '../middleware/logger.js';
import { projectPermissionedGovernanceChange } from './permissioned-governance-projector.js';

export interface SpacesConsumerDispatchConfig {
  readonly enabled: boolean;
  readonly unsafeAcceptUnverifiedPermissionedData: boolean;
  readonly db: Kysely<Database>;
  readonly spaces: ReadonlyArray<SpaceRef>;
  readonly permissionedRepo?: PermissionedRepoPort;
}

let activeConsumer: SpacesConsumer | null = null;

export async function startSpacesConsumer(
  cfg: SpacesConsumerDispatchConfig,
): Promise<SpacesConsumer | null> {
  if (!cfg.enabled) {
    logger.info(
      'Spaces consumer disabled by config (SPACES_CONSUMER_ENABLED=false)',
    );
    return null;
  }

  if (activeConsumer) {
    logger.warn(
      'startSpacesConsumer called twice; ignoring (existing consumer remains active)',
    );
    return activeConsumer;
  }

  if (
    cfg.unsafeAcceptUnverifiedPermissionedData &&
    process.env.NODE_ENV === 'production'
  ) {
    throw new Error(
      'UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA cannot be set in production.',
    );
  }

  const verification: PermissionedVerificationStatus =
    cfg.unsafeAcceptUnverifiedPermissionedData
      ? 'unverified-dev-mode'
      : 'failed-closed';

  if (cfg.unsafeAcceptUnverifiedPermissionedData) {
    logger.warn(
      'UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA=true — permissioned repo verification DISABLED. ' +
        'Never run with this flag in production.',
    );
  }

  const consumer = new SpacesConsumer({
    groupDirectory: new CsnDbGroupDirectoryPort(cfg.db),
    didEquivalence: new KyselyDidEquivalencePort(cfg.db),
    permissionedRepo:
      cfg.permissionedRepo ??
      new InMemoryPermissionedRepoPort({
        records: [],
        verification,
        checkpoints: new KyselyPermissionedCheckpointStore(cfg.db),
        clock: () => new Date(),
      }),
    onAccepted: async (record: VerifiedPermissionedRecord) => {
      const projection = await projectPermissionedGovernanceChange(
        cfg.db,
        record,
        new Date(),
      );
      logger.info(
        {
          location: record.location,
          operation: record.operation,
          cid: record.operation === 'delete' ? undefined : record.cid,
          projection,
        },
        'spaces-consumer: accepted record',
      );
    },
    onRejected: async ({ record, reason }) => {
      logger.warn(
        {
          location: record.location,
          operation: record.operation,
          cid: record.operation === 'delete' ? undefined : record.cid,
          reason,
        },
        'spaces-consumer: rejected verified record',
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
      groupDirectory: 'CsnDbGroupDirectoryPort',
      permissionedRepo: cfg.permissionedRepo
        ? cfg.permissionedRepo.constructor.name
        : 'InMemoryPermissionedRepoPort',
    },
    'Spaces consumer started (CSN membership acceptance and governance projection enabled)',
  );
  return consumer;
}

export function parseSpacesConsumerRefs(value: string): SpaceRef[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('SPACES_CONSUMER_SPACES must be valid JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('SPACES_CONSUMER_SPACES must be a JSON array');
  }
  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`SPACES_CONSUMER_SPACES[${index}] must be an object`);
    }
    const value = item as Record<string, unknown>;
    if (
      typeof value.arbiterDid !== 'string' ||
      !value.arbiterDid.startsWith('did:') ||
      typeof value.spaceKey !== 'string' ||
      !value.spaceKey ||
      typeof value.expectedSpaceType !== 'string' ||
      !value.expectedSpaceType
    ) {
      throw new Error(
        `SPACES_CONSUMER_SPACES[${index}] requires arbiterDid, spaceKey, and expectedSpaceType`,
      );
    }
    return {
      arbiterDid: value.arbiterDid as SpaceRef['arbiterDid'],
      spaceKey: value.spaceKey,
      expectedSpaceType: value.expectedSpaceType,
    };
  });
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
