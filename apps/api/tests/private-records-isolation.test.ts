import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

const COOP_B_DID = 'did:web:coop-b.example.com';

/**
 * Cross-cooperative private record isolation tests.
 *
 * Verifies that Tier 2 private data (stored in private_record table)
 * is correctly scoped by cooperative DID — records from Coop A are
 * never visible to Coop B, and vice versa.
 *
 * Strategy: Coop A uses the normal API (authenticated session via setupAndLogin).
 * Coop B's records are inserted directly into the database to simulate
 * a second cooperative's data without needing a second setup/initialize call.
 */
describe('Private Record Isolation', () => {
  let testApp: TestApp;
  let coopADid: string;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();

    testApp = createTestApp();
    const result = await setupAndLogin(testApp);
    coopADid = result.coopDid;

    // Seed Coop B's private records directly in the database
    const db = testApp.container.db;
    const now = new Date();
    await db
      .insertInto('private_record')
      .values([
        {
          did: COOP_B_DID,
          collection: 'network.coopsource.governance.draft',
          rkey: 'coopb-doc-1',
          record: JSON.stringify({ title: 'Coop B Secret', body: 'Confidential' }),
          created_by: 'did:web:admin-b.example.com',
          created_at: now,
          updated_at: now,
        },
        {
          did: COOP_B_DID,
          collection: 'network.coopsource.governance.draft',
          rkey: 'shared-key',
          record: JSON.stringify({ title: 'Coop B Shared Key Doc' }),
          created_by: 'did:web:admin-b.example.com',
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
  });

  it('Coop A cannot see Coop B private records via list', async () => {
    const listRes = await testApp.agent
      .get('/api/v1/private/records?collection=network.coopsource.governance.draft')
      .expect(200);

    expect(listRes.body.records).toHaveLength(0);
  });

  it('Coop A cannot read Coop B private record by collection+rkey', async () => {
    await testApp.agent
      .get('/api/v1/private/records/network.coopsource.governance.draft/coopb-doc-1')
      .expect(404);
  });

  it('Coop A creates a record and sees only its own', async () => {
    await testApp.agent
      .post('/api/v1/private/records')
      .send({
        collection: 'network.coopsource.governance.draft',
        record: { title: 'Coop A Secret' },
      })
      .expect(201);

    const listRes = await testApp.agent
      .get('/api/v1/private/records?collection=network.coopsource.governance.draft')
      .expect(200);

    expect(listRes.body.records).toHaveLength(1);
    expect(listRes.body.records[0].record.title).toBe('Coop A Secret');
  });

  it('Coop A and B can use same rkey without conflict', async () => {
    await testApp.agent
      .post('/api/v1/private/records')
      .send({
        collection: 'network.coopsource.governance.draft',
        rkey: 'shared-key',
        record: { title: 'Coop A Shared Key Doc' },
      })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/private/records/network.coopsource.governance.draft/shared-key')
      .expect(200);
    expect(res.body.record.title).toBe('Coop A Shared Key Doc');

    const coopBRecord = await testApp.container.db
      .selectFrom('private_record')
      .where('did', '=', COOP_B_DID)
      .where('rkey', '=', 'shared-key')
      .selectAll()
      .executeTakeFirst();
    expect(coopBRecord).toBeDefined();
  });

  it('Coop A deletion does not affect Coop B records', async () => {
    await testApp.agent
      .post('/api/v1/private/records')
      .send({
        collection: 'network.coopsource.governance.draft',
        rkey: 'shared-key',
        record: { title: 'Coop A Version' },
      })
      .expect(201);

    await testApp.agent
      .delete('/api/v1/private/records/network.coopsource.governance.draft/shared-key')
      .expect(204);

    await testApp.agent
      .get('/api/v1/private/records/network.coopsource.governance.draft/shared-key')
      .expect(404);

    const coopBRecord = await testApp.container.db
      .selectFrom('private_record')
      .where('did', '=', COOP_B_DID)
      .where('rkey', '=', 'shared-key')
      .selectAll()
      .executeTakeFirst();
    expect(coopBRecord).toBeDefined();
    expect((coopBRecord!.record as { title: string }).title).toBe('Coop B Shared Key Doc');
  });
});
