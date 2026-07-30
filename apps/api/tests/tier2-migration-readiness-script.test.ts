import { describe, expect, it } from 'vitest';
import { parseTier2MigrationReadinessArgs } from '../scripts/audit-tier2-governance-migration.js';

describe('Tier 2 governance migration readiness CLI', () => {
  it('uses the environment database URL and optional cooperative filter', () => {
    expect(
      parseTier2MigrationReadinessArgs(['--cooperative-did', 'did:plc:coop'], {
        DATABASE_URL: 'postgres://localhost/coopsource',
      }),
    ).toEqual({
      databaseUrl: 'postgres://localhost/coopsource',
      cooperativeDid: 'did:plc:coop',
    });
  });

  it('allows an explicit database URL', () => {
    expect(
      parseTier2MigrationReadinessArgs(['--database-url', 'postgres://localhost/other'], {}),
    ).toEqual({ databaseUrl: 'postgres://localhost/other' });
  });

  it('rejects missing configuration, malformed DIDs, and unknown options', () => {
    expect(() => parseTier2MigrationReadinessArgs([], {})).toThrow('Set DATABASE_URL');
    expect(() =>
      parseTier2MigrationReadinessArgs(['--cooperative-did', 'coop.example'], {
        DATABASE_URL: 'postgres://localhost/coopsource',
      }),
    ).toThrow('must be a DID');
    expect(() =>
      parseTier2MigrationReadinessArgs(['--write', 'true'], {
        DATABASE_URL: 'postgres://localhost/coopsource',
      }),
    ).toThrow('Unknown option');
  });
});
