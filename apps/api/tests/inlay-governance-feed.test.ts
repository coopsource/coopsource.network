import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Inlay GovernanceFeed component', () => {
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

  async function createOpenProposal(title: string) {
    const proposal = await testApp.container.proposalService.createProposal(
      adminDid,
      {
        cooperativeDid: coopDid,
        title,
        body: `Body of ${title}`,
        votingType: 'binary',
        quorumType: 'simpleMajority',
      },
    );
    await testApp.container.proposalService.openProposal(proposal.id, adminDid);
    return proposal;
  }

  it('returns proposals for open coop', async () => {
    await createOpenProposal('Budget Approval');

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.GovernanceFeed')
      .send({ did: coopDid })
      .expect(200);

    expect(res.body.node).toBeDefined();
    expect(res.body.cache.life).toBe('minutes');

    const json = JSON.stringify(res.body.node);
    expect(json).toContain('Budget Approval');
    expect(json).toContain('Open for voting');
  });

  it('returns empty state for coop with no proposals', async () => {
    const res = await bare
      .post('/xrpc/network.coopsource.inlay.GovernanceFeed')
      .send({ did: coopDid })
      .expect(200);

    const json = JSON.stringify(res.body.node);
    expect(json).toContain('No governance activity yet');
    expect(res.body.cache.life).toBe('hours');
  });

  it('returns fallback tree for closed-governance coop', async () => {
    await testApp.container.db
      .updateTable('cooperative_profile')
      .set({ governance_visibility: 'closed' })
      .where('entity_did', '=', coopDid)
      .execute();

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.GovernanceFeed')
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

    await createOpenProposal('Mixed Visibility Proposal');

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.GovernanceFeed')
      .send({ did: coopDid })
      .expect(200);

    const json = JSON.stringify(res.body.node);
    expect(json).toContain('Mixed Visibility Proposal');
  });

  it('excludes draft proposals', async () => {
    // Create a draft (not opened)
    await testApp.container.proposalService.createProposal(adminDid, {
      cooperativeDid: coopDid,
      title: 'Draft Proposal',
      body: 'Still in draft',
      votingType: 'binary',
      quorumType: 'simpleMajority',
    });

    // Create an open proposal
    await createOpenProposal('Open Proposal');

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.GovernanceFeed')
      .send({ did: coopDid })
      .expect(200);

    const json = JSON.stringify(res.body.node);
    expect(json).toContain('Open Proposal');
    expect(json).not.toContain('Draft Proposal');
  });

  it('returns 400 for missing did param', async () => {
    const res = await bare
      .post('/xrpc/network.coopsource.inlay.GovernanceFeed')
      .send({})
      .expect(400);

    expect(res.body.error).toBe('InvalidRequest');
  });

  it('respects 5-proposal limit', async () => {
    for (let i = 1; i <= 7; i++) {
      await createOpenProposal(`Proposal ${i}`);
    }

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.GovernanceFeed')
      .send({ did: coopDid })
      .expect(200);

    const json = JSON.stringify(res.body.node);
    // Count how many "Proposal" title entries appear (each has a unique number)
    const matches = json.match(/Proposal \d/g) ?? [];
    expect(matches.length).toBe(5);
  });
});
