import { describe, it, expect, beforeAll } from 'vitest';
import { AtprotoPdsService } from '../src/atproto/atproto-pds-service.js';
import { PlcClient } from '../src/local/plc-client.js';
import { generateRotationKeypair, k256PrivateKeyToPublicMultibase } from '../src/local/plc-signing.js';
import type { DID } from '@coopsource/common';

/**
 * Integration tests for AtprotoPdsService.
 * Requires a running PDS at PDS_URL (default: http://localhost:2583).
 *
 * Run: PDS_URL=http://localhost:2583 pnpm --filter @coopsource/federation test
 * Skip: these tests are skipped when PDS_URL is not set.
 */

// PDS_URL and PLC_URL are guaranteed to be set by globalSetup (starts Docker if needed)
const PDS_URL = process.env.PDS_URL!;
const PDS_ADMIN_PASSWORD = process.env.PDS_ADMIN_PASSWORD ?? 'admin';
const PLC_URL = process.env.PLC_URL ?? 'http://localhost:2582';

describe('AtprotoPdsService (integration)', () => {
  let service: AtprotoPdsService;
  let testDid: DID;

  beforeAll(() => {
    service = new AtprotoPdsService(PDS_URL!, PDS_ADMIN_PASSWORD, PLC_URL);
  });

  it('should create an account and get a DID', async () => {
    const handle = `test-${Date.now()}.test`;
    const doc = await service.createDid({
      entityType: 'person',
      handle,
      pdsUrl: PDS_URL!,
    });

    expect(doc.id).toMatch(/^did:plc:/);
    expect(doc.service).toBeDefined();
    testDid = doc.id;
  }, 30_000);

  it('should resolve the created DID', async () => {
    const doc = await service.resolveDid(testDid);
    expect(doc.id).toBe(testDid);
    expect(doc.verificationMethod).toBeDefined();
  });

  it('should create and read a record', async () => {
    const ref = await service.createRecord({
      did: testDid,
      collection: 'network.coopsource.test.item',
      record: {
        name: 'Test Record',
        createdAt: new Date().toISOString(),
      },
    });

    expect(ref.uri).toContain(testDid);
    expect(ref.cid).toBeTruthy();

    const record = await service.getRecord(ref.uri);
    expect(record.value).toMatchObject({ name: 'Test Record' });
  }, 15_000);

  it('should list records', async () => {
    const records = await service.listRecords(
      testDid,
      'network.coopsource.test.item',
    );
    expect(records.length).toBeGreaterThanOrEqual(1);
  });

  it('should put (upsert) a record', async () => {
    const ref = await service.putRecord({
      did: testDid,
      collection: 'network.coopsource.test.item',
      rkey: 'test-rkey',
      record: {
        name: 'Upserted Record',
        createdAt: new Date().toISOString(),
      },
    });

    expect(ref.uri).toContain('test-rkey');

    const record = await service.getRecord(ref.uri);
    expect(record.value).toMatchObject({ name: 'Upserted Record' });
  }, 15_000);

  it('should delete a record', async () => {
    await service.deleteRecord({
      did: testDid,
      collection: 'network.coopsource.test.item',
      rkey: 'test-rkey',
    });

    await expect(
      service.getRecord(`at://${testDid}/network.coopsource.test.item/test-rkey`),
    ).rejects.toThrow();
  }, 15_000);
});

/**
 * PLC signing integration tests.
 * Requires a running PLC directory at PLC_URL (default: http://localhost:2582).
 */
describe('PlcClient signed operations (integration)', () => {
  let plc: PlcClient;

  beforeAll(() => {
    plc = new PlcClient(PLC_URL);
  });

  it('should create a DID with a signed genesis operation', async () => {
    const { privateKeyHex, publicKeyMultibase } = await generateRotationKeypair();
    // PLC directory expects did:key:-prefixed keys in rotationKeys
    const didKey = `did:key:${publicKeyMultibase}`;

    const did = await plc.create(
      {
        signingKey: didKey,
        handle: `test-${Date.now()}.test`,
        pdsUrl: PDS_URL!,
        rotationKeys: [didKey],
      },
      { type: 'k256', privateKeyHex },
    );

    expect(did).toMatch(/^did:plc:/);

    // Verify the DID resolves
    const doc = await plc.resolve(did);
    expect(doc).toHaveProperty('id', did);
  }, 15_000);

  it('should resolve a created DID', async () => {
    const { privateKeyHex, publicKeyMultibase } = await generateRotationKeypair();
    const didKey = `did:key:${publicKeyMultibase}`;

    const did = await plc.create(
      {
        signingKey: didKey,
        handle: `resolve-${Date.now()}.test`,
        pdsUrl: PDS_URL!,
        rotationKeys: [didKey],
      },
      { type: 'k256', privateKeyHex },
    );

    const doc = await plc.resolve(did) as Record<string, unknown>;
    expect(doc).toHaveProperty('id', did);
    expect(doc).toHaveProperty('alsoKnownAs');
  }, 15_000);
});
