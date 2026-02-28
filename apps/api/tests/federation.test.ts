import { describe, it, expect, beforeAll } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';

describe('Federation endpoints', () => {
  let testApp: TestApp;
  let coopDid: string;
  let adminDid: string;

  beforeAll(async () => {
    await truncateAllTables();
    testApp = createTestApp();
    const result = await setupAndLogin(testApp);
    coopDid = result.coopDid;
    adminDid = result.adminDid;
  });

  describe('GET /api/v1/federation/entity/:did', () => {
    it('returns entity info for a valid DID', async () => {
      const res = await testApp.agent
        .get(`/api/v1/federation/entity/${encodeURIComponent(coopDid)}`)
        .expect(200);

      expect(res.body.did).toBe(coopDid);
      expect(res.body.displayName).toBe('Test Cooperative');
      expect(res.body.type).toBe('cooperative');
      expect(res.body.status).toBe('active');
    });

    it('returns entity info for admin DID', async () => {
      const res = await testApp.agent
        .get(`/api/v1/federation/entity/${encodeURIComponent(adminDid)}`)
        .expect(200);

      expect(res.body.did).toBe(adminDid);
      expect(res.body.type).toBe('person');
    });

    it('returns 404 for unknown DID', async () => {
      await testApp.agent
        .get('/api/v1/federation/entity/did%3Aweb%3Aunknown.example.com')
        .expect(404);
    });
  });

  describe('GET /api/v1/federation/coop/:did/profile', () => {
    it('returns coop profile for a cooperative DID', async () => {
      const res = await testApp.agent
        .get(`/api/v1/federation/coop/${encodeURIComponent(coopDid)}/profile`)
        .expect(200);

      expect(res.body.did).toBe(coopDid);
      expect(res.body.displayName).toBe('Test Cooperative');
      expect(res.body.cooperativeType).toBeDefined();
      expect(res.body.membershipPolicy).toBeDefined();
      expect(typeof res.body.memberCount).toBe('number');
    });

    it('returns 404 for unknown DID', async () => {
      await testApp.agent
        .get('/api/v1/federation/coop/did%3Aweb%3Aunknown.example.com/profile')
        .expect(404);
    });

    it('returns 404 for non-cooperative entity (person)', async () => {
      await testApp.agent
        .get(`/api/v1/federation/coop/${encodeURIComponent(adminDid)}/profile`)
        .expect(404);
    });
  });

  describe('POST /api/v1/federation/membership/approve', () => {
    it('succeeds when called from a local user session (skips signature check)', async () => {
      // In standalone mode with a session, requireFederationAuth skips.
      // This creates a memberApproval PDS record locally.
      const res = await testApp.agent
        .post('/api/v1/federation/membership/approve')
        .send({
          cooperativeDid: coopDid,
          memberDid: adminDid,
          roles: ['member'],
        })
        .expect(201);

      expect(res.body.approvalRecordUri).toBeDefined();
      expect(res.body.approvalRecordCid).toBeDefined();
    });

    it('validates request body', async () => {
      await testApp.agent
        .post('/api/v1/federation/membership/approve')
        .send({ cooperativeDid: coopDid })
        .expect(400);
    });
  });

  describe('POST /api/v1/federation/membership/request', () => {
    it('creates membership record via session auth', async () => {
      const res = await testApp.agent
        .post('/api/v1/federation/membership/request')
        .send({
          memberDid: adminDid,
          cooperativeDid: coopDid,
        })
        .expect(201);

      expect(res.body.memberRecordUri).toBeDefined();
      expect(res.body.memberRecordCid).toBeDefined();
    });
  });

  describe('POST /api/v1/federation/hub/register', () => {
    it('returns 501 Not Implemented (stub)', async () => {
      const res = await testApp.agent
        .post('/api/v1/federation/hub/register')
        .send({
          cooperativeDid: coopDid,
          hubUrl: 'http://localhost:3001',
          metadata: {
            displayName: 'Test Cooperative',
          },
        })
        .expect(501);

      expect(res.body.error).toBe('NotImplemented');
    });
  });

  describe('POST /api/v1/federation/hub/notify', () => {
    it('returns 501 Not Implemented (stub)', async () => {
      const res = await testApp.agent
        .post('/api/v1/federation/hub/notify')
        .send({
          type: 'membership.approved',
          sourceDid: coopDid,
          data: { memberDid: adminDid },
          timestamp: new Date().toISOString(),
        })
        .expect(501);

      expect(res.body.error).toBe('NotImplemented');
    });
  });

  describe('POST /api/v1/federation/agreement/sign-request', () => {
    it('returns 501 Not Implemented (stub)', async () => {
      const res = await testApp.agent
        .post('/api/v1/federation/agreement/sign-request')
        .send({
          agreementUri: 'at://did:plc:test/agreement/1',
          signerDid: adminDid,
          cooperativeDid: coopDid,
        })
        .expect(501);

      expect(res.body.error).toBe('NotImplemented');
    });
  });
});
