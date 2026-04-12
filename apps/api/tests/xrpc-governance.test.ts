import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('XRPC governance handlers', () => {
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

  /** Helper: create a proposal via the REST API (already authenticated from setupAndLogin). */
  async function createProposal(overrides: Record<string, unknown> = {}) {
    const res = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Test proposal',
        body: 'Proposal body text.',
        votingType: 'binary',
        quorumType: 'simpleMajority',
        ...overrides,
      })
      .expect(201);
    return res.body;
  }

  describe('network.coopsource.org.getCooperative', () => {
    it('returns cooperative profile for open-governance coop', async () => {
      const res = await testApp.agent
        .get('/xrpc/network.coopsource.org.getCooperative')
        .query({ cooperative: coopDid })
        .expect(200);

      expect(res.body.did).toBe(coopDid);
      expect(res.body.displayName).toBe('Test Cooperative');
      expect(res.body.cooperativeType).toBeDefined();
      expect(res.body.membershipPolicy).toBeDefined();
      expect(res.body.governanceVisibility).toBe('open');
      expect(res.body.isNetwork).toBe(false);
    });

    it('returns 404 for nonexistent cooperative DID', async () => {
      const res = await testApp.agent
        .get('/xrpc/network.coopsource.org.getCooperative')
        .query({ cooperative: 'did:plc:nonexistent' })
        .expect(404);

      expect(res.body.error).toBe('NotFound');
    });

    it('returns 404 for closed-governance cooperative', async () => {
      await testApp.container.db
        .updateTable('cooperative_profile')
        .set({ governance_visibility: 'closed' })
        .where('entity_did', '=', coopDid)
        .execute();

      const res = await testApp.agent
        .get('/xrpc/network.coopsource.org.getCooperative')
        .query({ cooperative: coopDid })
        .expect(404);

      expect(res.body.error).toBe('NotFound');
    });
  });
});
