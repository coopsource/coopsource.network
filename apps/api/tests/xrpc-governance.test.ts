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

  describe('network.coopsource.governance.listProposals', () => {
    it('returns empty list when no proposals exist', async () => {
      const res = await testApp.agent
        .get('/xrpc/network.coopsource.governance.listProposals')
        .query({ cooperative: coopDid })
        .expect(200);

      expect(res.body.proposals).toEqual([]);
      expect(res.body.cursor).toBeUndefined();
    });

    it('returns proposals with correct shape', async () => {
      const proposal = await createProposal({ title: 'Open-source policy' });

      const res = await testApp.agent
        .get('/xrpc/network.coopsource.governance.listProposals')
        .query({ cooperative: coopDid })
        .expect(200);

      expect(res.body.proposals).toHaveLength(1);
      expect(res.body.proposals[0]).toMatchObject({
        id: proposal.id,
        title: 'Open-source policy',
        status: 'draft',
        votingType: 'binary',
        cooperativeDid: coopDid,
        authorDid: adminDid,
      });
      expect(res.body.proposals[0].createdAt).toBeDefined();
    });

    it('paginates with cursor and limit', async () => {
      await createProposal({ title: 'Proposal A' });
      testApp.clock.advance(1000);
      await createProposal({ title: 'Proposal B' });
      testApp.clock.advance(1000);
      await createProposal({ title: 'Proposal C' });

      const page1 = await testApp.agent
        .get('/xrpc/network.coopsource.governance.listProposals')
        .query({ cooperative: coopDid, limit: 2 })
        .expect(200);

      expect(page1.body.proposals).toHaveLength(2);
      expect(page1.body.cursor).toBeDefined();

      const page2 = await testApp.agent
        .get('/xrpc/network.coopsource.governance.listProposals')
        .query({ cooperative: coopDid, limit: 2, cursor: page1.body.cursor })
        .expect(200);

      expect(page2.body.proposals).toHaveLength(1);
      const allTitles = [
        ...page1.body.proposals.map((p: { title: string }) => p.title),
        ...page2.body.proposals.map((p: { title: string }) => p.title),
      ];
      expect(new Set(allTitles).size).toBe(3);
    });

    it('filters by status', async () => {
      await createProposal({ title: 'Draft one' });
      const openProposal = await createProposal({ title: 'Open one' });
      await testApp.agent
        .post(`/api/v1/proposals/${openProposal.id}/open`)
        .expect(200);

      const res = await testApp.agent
        .get('/xrpc/network.coopsource.governance.listProposals')
        .query({ cooperative: coopDid, status: 'open' })
        .expect(200);

      expect(res.body.proposals).toHaveLength(1);
      expect(res.body.proposals[0].title).toBe('Open one');
    });

    it('returns 404 for closed-governance cooperative', async () => {
      await testApp.container.db
        .updateTable('cooperative_profile')
        .set({ governance_visibility: 'closed' })
        .where('entity_did', '=', coopDid)
        .execute();

      await testApp.agent
        .get('/xrpc/network.coopsource.governance.listProposals')
        .query({ cooperative: coopDid })
        .expect(404);
    });
  });
});
