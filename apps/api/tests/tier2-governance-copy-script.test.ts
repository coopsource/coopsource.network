import { describe, expect, it } from 'vitest';
import {
  parseTier2GovernanceCopyArgs,
  TIER2_COPY_CONFIRMATION,
  withTier2GovernanceMigrationLock,
} from '../scripts/copy-tier2-governance.js';
import { getTestDb } from './helpers/test-db.js';

const enabledEnv = {
  DATABASE_URL: 'postgres://localhost/coopsource',
  PUBLIC_API_URL: 'https://csn.example',
  TIER2_GOVERNANCE_MIGRATION_ENABLED: 'true',
};

describe('Tier 2 governance copy CLI', () => {
  it('requires the dedicated activation gate', () => {
    expect(() =>
      parseTier2GovernanceCopyArgs(
        ['--operation', 'verify', '--cooperative-did', 'did:plc:coop'],
        {
          DATABASE_URL: 'postgres://localhost/coopsource',
        },
      ),
    ).toThrow('TIER2_GOVERNANCE_MIGRATION_ENABLED=true');
  });

  it('requires one cooperative and an exact confirmation for remote copy', () => {
    expect(() =>
      parseTier2GovernanceCopyArgs(
        ['--operation', 'copy', '--cooperative-did', 'did:plc:coop'],
        enabledEnv,
      ),
    ).toThrow(TIER2_COPY_CONFIRMATION);
    expect(
      parseTier2GovernanceCopyArgs(
        [
          '--operation',
          'copy',
          '--cooperative-did',
          'did:plc:coop',
          '--confirm',
          TIER2_COPY_CONFIRMATION,
        ],
        enabledEnv,
      ),
    ).toEqual({
      operation: 'copy',
      databaseUrl: 'postgres://localhost/coopsource',
      cooperativeDid: 'did:plc:coop',
      publicApiUrl: 'https://csn.example',
    });
  });

  it('allows verification without constructing copy-only configuration', () => {
    expect(
      parseTier2GovernanceCopyArgs(
        ['--operation', 'verify', '--cooperative-did', 'did:plc:coop'],
        {
          DATABASE_URL: 'postgres://localhost/coopsource',
          TIER2_GOVERNANCE_MIGRATION_ENABLED: 'true',
        },
      ),
    ).toEqual({
      operation: 'verify',
      databaseUrl: 'postgres://localhost/coopsource',
      cooperativeDid: 'did:plc:coop',
    });
  });

  it('rejects malformed, duplicate, and copy-only verification options', () => {
    expect(() =>
      parseTier2GovernanceCopyArgs(
        ['--operation', 'verify', '--cooperative-did', 'coop.example'],
        enabledEnv,
      ),
    ).toThrow('explicit DID');
    expect(() =>
      parseTier2GovernanceCopyArgs(
        [
          '--operation',
          'verify',
          '--operation',
          'copy',
          '--cooperative-did',
          'did:plc:coop',
        ],
        enabledEnv,
      ),
    ).toThrow('Duplicate option');
    expect(() =>
      parseTier2GovernanceCopyArgs(
        [
          '--operation',
          'verify',
          '--cooperative-did',
          'did:plc:coop',
          '--confirm',
          TIER2_COPY_CONFIRMATION,
        ],
        enabledEnv,
      ),
    ).toThrow('only valid for copy');
    expect(() =>
      parseTier2GovernanceCopyArgs(
        [
          '--operation',
          'copy',
          '--cooperative-did',
          'did:plc:coop',
          '--public-api-url',
          'file:///tmp/csn',
          '--confirm',
          TIER2_COPY_CONFIRMATION,
        ],
        enabledEnv,
      ),
    ).toThrow('HTTP(S)');
  });

  it('rejects a concurrent operation for the same cooperative', async () => {
    const db = getTestDb();
    let releaseFirst!: () => void;
    let signalEntered!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve;
    });
    const first = withTier2GovernanceMigrationLock(
      db,
      'did:plc:coop',
      async () => {
        signalEntered();
        await release;
        return 'complete';
      },
    );

    await entered;
    try {
      await expect(
        withTier2GovernanceMigrationLock(
          db,
          'did:plc:coop',
          async () => 'unexpected',
        ),
      ).rejects.toThrow('already running');
    } finally {
      releaseFirst();
    }
    await expect(first).resolves.toBe('complete');
  });
});
