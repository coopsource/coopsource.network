import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('network.coopsource.admin.getOfficers', () => {
  let testApp: TestApp;
  let coopDid: string;
  let adminDid: string;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
    const setup = await setupAndLogin(testApp);
    coopDid = setup.coopDid;
    adminDid = setup.adminDid;
  });

  it('returns empty officers list when none appointed', async () => {
    const res = await testApp.agent
      .get('/xrpc/network.coopsource.admin.getOfficers')
      .query({ cooperative: coopDid })
      .expect(200);

    expect(res.body.officers).toEqual([]);
  });

  it('returns current officers with display name', async () => {
    const now = new Date();
    const termEnds = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    await testApp.container.officerRecordService.appoint(coopDid, {
      officerDid: adminDid,
      title: 'President',
      appointedAt: now.toISOString(),
      termEndsAt: termEnds.toISOString(),
      appointmentType: 'elected',
    });

    const res = await testApp.agent
      .get('/xrpc/network.coopsource.admin.getOfficers')
      .query({ cooperative: coopDid })
      .expect(200);

    expect(res.body.officers).toHaveLength(1);
    expect(res.body.officers[0]).toMatchObject({
      did: adminDid,
      displayName: 'Test Admin',
      title: 'President',
    });
    expect(res.body.officers[0].appointedAt).toBeDefined();
    expect(res.body.officers[0].termEndsAt).toBeDefined();
  });

  it('does not include ended officers', async () => {
    const officer = await testApp.container.officerRecordService.appoint(coopDid, {
      officerDid: adminDid,
      title: 'Secretary',
      appointedAt: new Date().toISOString(),
      appointmentType: 'appointed',
    });

    await testApp.container.officerRecordService.endTerm(officer.id, coopDid);

    const res = await testApp.agent
      .get('/xrpc/network.coopsource.admin.getOfficers')
      .query({ cooperative: coopDid })
      .expect(200);

    expect(res.body.officers).toEqual([]);
  });

  it('returns 404 for closed-governance cooperative', async () => {
    await testApp.container.db
      .updateTable('cooperative_profile')
      .set({ governance_visibility: 'closed' })
      .where('entity_did', '=', coopDid)
      .execute();

    await testApp.agent
      .get('/xrpc/network.coopsource.admin.getOfficers')
      .query({ cooperative: coopDid })
      .expect(404);
  });

  it('does not require authentication', async () => {
    const bare = supertest(testApp.app);
    const res = await bare
      .get('/xrpc/network.coopsource.admin.getOfficers')
      .query({ cooperative: coopDid })
      .expect(200);

    expect(res.body.officers).toEqual([]);
  });
});
