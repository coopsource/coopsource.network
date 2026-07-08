import type { DID } from '@coopsource/common';
import { KyselyDidEquivalencePort } from '@coopsource/spaces-consumer';
import { beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, truncateAllTables } from './helpers/test-db.js';

const oldDid = 'did:plc:oldmember' as DID;
const midDid = 'did:plc:midmember' as DID;
const currentDid = 'did:plc:currentmember' as DID;
const otherDid = 'did:plc:othermember' as DID;

describe('KyselyDidEquivalencePort', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it('treats exact DIDs as equivalent without rotation history', async () => {
    const port = new KyselyDidEquivalencePort(getTestDb());

    await expect(port.areEquivalent(currentDid, currentDid)).resolves.toBe(
      true,
    );
    await expect(port.areEquivalent(currentDid, otherDid)).resolves.toBe(false);
  });

  it('resolves prior DIDs through did_rotation_history chains', async () => {
    const db = getTestDb();
    const port = new KyselyDidEquivalencePort(db);

    await db
      .insertInto('did_rotation_history')
      .values([
        {
          prior_did: oldDid,
          current_did: midDid,
          rotated_at: new Date('2026-01-01T00:00:00Z'),
          evidence_uri: 'at://did:plc:authority/plc/old-to-mid',
        },
        {
          prior_did: midDid,
          current_did: currentDid,
          rotated_at: new Date('2026-02-01T00:00:00Z'),
          evidence_uri: 'at://did:plc:authority/plc/mid-to-current',
        },
      ])
      .execute();

    await expect(port.areEquivalent(oldDid, currentDid)).resolves.toBe(true);
    await expect(port.areEquivalent(oldDid, midDid)).resolves.toBe(true);
    await expect(port.areEquivalent(midDid, currentDid)).resolves.toBe(true);
    await expect(port.areEquivalent(oldDid, otherDid)).resolves.toBe(false);
  });

  it('fails closed on corrupt rotation cycles', async () => {
    const db = getTestDb();
    const port = new KyselyDidEquivalencePort(db);

    await db
      .insertInto('did_rotation_history')
      .values([
        {
          prior_did: oldDid,
          current_did: midDid,
          rotated_at: new Date('2026-01-01T00:00:00Z'),
          evidence_uri: null,
        },
        {
          prior_did: midDid,
          current_did: oldDid,
          rotated_at: new Date('2026-02-01T00:00:00Z'),
          evidence_uri: null,
        },
      ])
      .execute();

    await expect(port.areEquivalent(oldDid, currentDid)).rejects.toThrow(
      'DID rotation history contains a cycle',
    );
  });
});
