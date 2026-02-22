import { describe, it, expect, beforeAll } from 'vitest';
import { AtprotoPdsService } from '../src/atproto/atproto-pds-service.js';
import type { DID } from '@coopsource/common';

/**
 * Integration tests for AtprotoPdsService.
 * Requires a running PDS at PDS_URL (default: http://localhost:2583).
 *
 * Run: PDS_URL=http://localhost:2583 pnpm --filter @coopsource/federation test
 * Skip: these tests are skipped when PDS_URL is not set.
 */

const PDS_URL = process.env.PDS_URL;
const PDS_ADMIN_PASSWORD = process.env.PDS_ADMIN_PASSWORD ?? 'admin';
const PLC_URL = process.env.PLC_URL ?? 'http://localhost:2582';

const describeIfPds = PDS_URL ? describe : describe.skip;

describeIfPds('AtprotoPdsService (integration)', () => {
  let service: AtprotoPdsService;
  let testDid: DID;

  beforeAll(() => {
    service = new AtprotoPdsService(PDS_URL!, PDS_ADMIN_PASSWORD, PLC_URL);
  });

  it('should create an account and get a DID', async () => {
    const handle = `test-${Date.now()}.localhost`;
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
