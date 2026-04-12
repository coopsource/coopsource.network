import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('network.coopsource.governance.getVoteEligibility', () => {
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

  async function createOpenProposal() {
    const createRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Eligibility test proposal',
        body: 'Test body.',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${createRes.body.id}/open`)
      .expect(200);

    return createRes.body.id as string;
  }

  it('returns eligible with weight for active member on open proposal', async () => {
    const proposalId = await createOpenProposal();

    const res = await testApp.agent
      .get('/xrpc/network.coopsource.governance.getVoteEligibility')
      .query({ proposal: proposalId })
      .expect(200);

    expect(res.body).toMatchObject({
      eligible: true,
      weight: 1,
      hasVoted: false,
    });
    expect(res.body.reason).toBeUndefined();
  });

  it('returns ineligible when proposal is not open for voting', async () => {
    const createRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Draft proposal',
        body: 'Not open yet.',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    const res = await testApp.agent
      .get('/xrpc/network.coopsource.governance.getVoteEligibility')
      .query({ proposal: createRes.body.id })
      .expect(200);

    expect(res.body).toMatchObject({
      eligible: false,
      weight: 0,
      hasVoted: false,
      reason: 'proposal_not_voting',
    });
  });

  it('returns hasVoted true after casting a vote', async () => {
    const proposalId = await createOpenProposal();

    await testApp.agent
      .post(`/api/v1/proposals/${proposalId}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    const res = await testApp.agent
      .get('/xrpc/network.coopsource.governance.getVoteEligibility')
      .query({ proposal: proposalId })
      .expect(200);

    expect(res.body).toMatchObject({
      eligible: false,
      hasVoted: true,
      reason: 'already_voted',
    });
    expect(res.body.weight).toBeGreaterThanOrEqual(1);
  });

  it('returns 401 without session', async () => {
    const proposalId = await createOpenProposal();

    const bare = supertest(testApp.app);
    await bare
      .get('/xrpc/network.coopsource.governance.getVoteEligibility')
      .query({ proposal: proposalId })
      .expect(401);
  });

  it('returns 404 for nonexistent proposal', async () => {
    const res = await testApp.agent
      .get('/xrpc/network.coopsource.governance.getVoteEligibility')
      .query({ proposal: '00000000-0000-0000-0000-000000000000' })
      .expect(404);

    expect(res.body.error).toBe('NotFound');
  });

  it('returns 401 for closed-governance cooperative (unauthenticated)', async () => {
    const proposalId = await createOpenProposal();

    await testApp.container.db
      .updateTable('cooperative_profile')
      .set({ governance_visibility: 'closed' })
      .where('entity_did', '=', coopDid)
      .execute();

    const bare = supertest(testApp.app);
    await bare
      .get('/xrpc/network.coopsource.governance.getVoteEligibility')
      .query({ proposal: proposalId })
      .expect(401);
  });

  it('returns eligibility for closed-governance cooperative when authenticated as member', async () => {
    const proposalId = await createOpenProposal();

    await testApp.container.db
      .updateTable('cooperative_profile')
      .set({ governance_visibility: 'closed' })
      .where('entity_did', '=', coopDid)
      .execute();

    const res = await testApp.agent
      .get('/xrpc/network.coopsource.governance.getVoteEligibility')
      .query({ proposal: proposalId })
      .expect(200);

    expect(res.body).toMatchObject({
      eligible: true,
      weight: 1,
      hasVoted: false,
    });
  });
});
