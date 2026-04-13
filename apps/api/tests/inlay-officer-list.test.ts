import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Inlay OfficerList component', () => {
  let testApp: TestApp;
  let coopDid: string;
  let adminDid: string;
  let bare: ReturnType<typeof supertest>;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();

    testApp = createTestApp();
    const setup = await setupAndLogin(testApp);
    coopDid = setup.coopDid;
    adminDid = setup.adminDid;

    bare = supertest(testApp.app);
  });

  it('returns officer tree for open coop with officers', async () => {
    // Appoint an officer
    await testApp.container.officerRecordService.appoint(coopDid, {
      officerDid: adminDid,
      title: 'President',
      appointedAt: new Date().toISOString(),
      appointmentType: 'elected',
    });

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.OfficerList')
      .send({ did: coopDid })
      .expect(200);

    expect(res.body.node).toBeDefined();
    expect(res.body.cache).toBeDefined();
    expect(res.body.cache.life).toBe('hours');

    const json = JSON.stringify(res.body.node);
    expect(json).toContain('President');
    expect(json).toContain('Test Admin');
  });

  it('returns empty state for coop with no officers', async () => {
    const res = await bare
      .post('/xrpc/network.coopsource.inlay.OfficerList')
      .send({ did: coopDid })
      .expect(200);

    const json = JSON.stringify(res.body.node);
    expect(json).toContain('No officers appointed');
  });

  it('returns fallback tree for closed-governance coop', async () => {
    // Set governance to closed
    await testApp.container.db
      .updateTable('cooperative_profile')
      .set({ governance_visibility: 'closed' })
      .where('entity_did', '=', coopDid)
      .execute();

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.OfficerList')
      .send({ did: coopDid })
      .expect(200);

    const json = JSON.stringify(res.body.node);
    expect(json).toContain('governance is private');
  });

  it('treats mixed-visibility same as open', async () => {
    await testApp.container.db
      .updateTable('cooperative_profile')
      .set({ governance_visibility: 'mixed' })
      .where('entity_did', '=', coopDid)
      .execute();

    await testApp.container.officerRecordService.appoint(coopDid, {
      officerDid: adminDid,
      title: 'Secretary',
      appointedAt: new Date().toISOString(),
      appointmentType: 'elected',
    });

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.OfficerList')
      .send({ did: coopDid })
      .expect(200);

    const json = JSON.stringify(res.body.node);
    expect(json).toContain('Secretary');
  });

  it('returns 404 for nonexistent DID', async () => {
    const res = await bare
      .post('/xrpc/network.coopsource.inlay.OfficerList')
      .send({ did: 'did:plc:nonexistent' })
      .expect(404);

    expect(res.body.error).toBe('NotFound');
  });

  it('returns 400 for missing did param', async () => {
    const res = await bare
      .post('/xrpc/network.coopsource.inlay.OfficerList')
      .send({})
      .expect(400);

    expect(res.body.error).toBe('InvalidRequest');
  });

  it('rejects GET requests with 405', async () => {
    const res = await bare
      .get('/xrpc/network.coopsource.inlay.OfficerList')
      .query({ did: coopDid })
      .expect(405);

    expect(res.body.error).toBe('InvalidMethod');
  });
});
