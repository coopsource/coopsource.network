import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Proposals & Voting', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  /**
   * Helper: create a draft proposal via the API.
   * Returns the response body (formatted camelCase proposal).
   */
  async function createDraftProposal(
    agent: import('supertest').Agent,
    overrides: Record<string, unknown> = {},
  ) {
    const body = {
      title: 'Adopt open-source policy',
      body: 'We should release all internal tools under the MIT license.',
      votingType: 'binary',
      quorumType: 'simpleMajority',
      ...overrides,
    };
    const res = await agent.post('/api/v1/proposals').send(body).expect(201);
    return res.body;
  }

  // ---------------------------------------------------------------
  // 1. Create draft proposal
  // ---------------------------------------------------------------
  it('creates a draft proposal (201, camelCase response)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    const proposal = await createDraftProposal(testApp.agent);

    expect(proposal.id).toBeDefined();
    expect(proposal.title).toBe('Adopt open-source policy');
    expect(proposal.body).toBe(
      'We should release all internal tools under the MIT license.',
    );
    expect(proposal.status).toBe('draft');
    expect(proposal.votingType).toBe('binary');
    expect(proposal.quorumType).toBe('simpleMajority');
    expect(proposal.quorumBasis).toBeDefined();
    expect(proposal.authorDid).toBe(adminDid);
    expect(proposal.authorDisplayName).toBe('Test Admin');
    expect(proposal.createdAt).toBeDefined();
    // closesAt is null when not provided
    expect(proposal.closesAt).toBeNull();
  });

  // ---------------------------------------------------------------
  // 2. List proposals
  // ---------------------------------------------------------------
  it('lists proposals with cursor-based pagination', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await createDraftProposal(testApp.agent, { title: 'Proposal A' });
    testApp.clock.advance(1000);
    await createDraftProposal(testApp.agent, { title: 'Proposal B' });

    const res = await testApp.agent.get('/api/v1/proposals').expect(200);

    expect(res.body).toHaveProperty('proposals');
    expect(res.body).toHaveProperty('cursor');
    expect(Array.isArray(res.body.proposals)).toBe(true);
    expect(res.body.proposals).toHaveLength(2);
    // Most recent first
    expect(res.body.proposals[0].title).toBe('Proposal B');
    expect(res.body.proposals[1].title).toBe('Proposal A');
  });

  // ---------------------------------------------------------------
  // 3. Get proposal by ID
  // ---------------------------------------------------------------
  it('gets a proposal by ID', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);
    const res = await testApp.agent
      .get(`/api/v1/proposals/${created.id}`)
      .expect(200);

    expect(res.body.id).toBe(created.id);
    expect(res.body.title).toBe(created.title);
    expect(res.body.authorDisplayName).toBe('Test Admin');
  });

  // ---------------------------------------------------------------
  // 4. Update draft proposal
  // ---------------------------------------------------------------
  it('updates a draft proposal (title change)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);

    const res = await testApp.agent
      .put(`/api/v1/proposals/${created.id}`)
      .send({ title: 'Updated title' })
      .expect(200);

    expect(res.body.title).toBe('Updated title');
    // Body unchanged
    expect(res.body.body).toBe(created.body);
    expect(res.body.status).toBe('draft');
  });

  // ---------------------------------------------------------------
  // 5. Open proposal (draft -> open)
  // ---------------------------------------------------------------
  it('opens a draft proposal', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);

    const res = await testApp.agent
      .post(`/api/v1/proposals/${created.id}/open`)
      .expect(200);

    expect(res.body.status).toBe('open');
    expect(res.body.id).toBe(created.id);
  });

  // ---------------------------------------------------------------
  // 6. Cast vote on open proposal
  // ---------------------------------------------------------------
  it('casts a vote on an open proposal (201, camelCase)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);
    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/open`)
      .expect(200);

    const res = await testApp.agent
      .post(`/api/v1/proposals/${created.id}/vote`)
      .send({ choice: 'yes', rationale: 'Fully in favor' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.proposalId).toBe(created.id);
    expect(res.body.voterDid).toBe(adminDid);
    expect(res.body.voterDisplayName).toBe('Test Admin');
    expect(res.body.choice).toBe('yes');
    expect(res.body.rationale).toBe('Fully in favor');
    expect(res.body.createdAt).toBeDefined();
  });

  // ---------------------------------------------------------------
  // 7. Re-vote (auto-retracts previous via partial unique index)
  // ---------------------------------------------------------------
  it('re-votes by auto-retracting the previous vote', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);
    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/open`)
      .expect(200);

    // First vote
    const vote1 = await testApp.agent
      .post(`/api/v1/proposals/${created.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    // Re-vote with different choice
    const vote2 = await testApp.agent
      .post(`/api/v1/proposals/${created.id}/vote`)
      .send({ choice: 'no' })
      .expect(201);

    // Should be a new vote row
    expect(vote2.body.id).not.toBe(vote1.body.id);
    expect(vote2.body.choice).toBe('no');

    // Verify only the new vote is active via the votes endpoint
    const votesRes = await testApp.agent
      .get(`/api/v1/proposals/${created.id}/votes`)
      .expect(200);

    expect(votesRes.body.votes).toHaveLength(1);
    expect(votesRes.body.votes[0].choice).toBe('no');
    expect(votesRes.body.tally.no).toBe(1);
  });

  // ---------------------------------------------------------------
  // 8. Retract vote (DELETE)
  // ---------------------------------------------------------------
  it('retracts a vote (204)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);
    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/open`)
      .expect(200);

    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    await testApp.agent
      .delete(`/api/v1/proposals/${created.id}/vote`)
      .expect(204);

    // Verify no active votes
    const votesRes = await testApp.agent
      .get(`/api/v1/proposals/${created.id}/votes`)
      .expect(200);

    expect(votesRes.body.votes).toHaveLength(0);
  });

  // ---------------------------------------------------------------
  // 9. Re-vote after retraction (partial unique index allows it)
  // ---------------------------------------------------------------
  it('allows re-voting after retraction', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);
    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/open`)
      .expect(200);

    // Vote, retract, then vote again
    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    await testApp.agent
      .delete(`/api/v1/proposals/${created.id}/vote`)
      .expect(204);

    const res = await testApp.agent
      .post(`/api/v1/proposals/${created.id}/vote`)
      .send({ choice: 'abstain' })
      .expect(201);

    expect(res.body.choice).toBe('abstain');

    // Only the new vote should be active
    const votesRes = await testApp.agent
      .get(`/api/v1/proposals/${created.id}/votes`)
      .expect(200);

    expect(votesRes.body.votes).toHaveLength(1);
    expect(votesRes.body.votes[0].choice).toBe('abstain');
  });

  // ---------------------------------------------------------------
  // 10. Close proposal (admin only)
  // ---------------------------------------------------------------
  it('closes an open proposal (admin only)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);
    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/open`)
      .expect(200);

    const res = await testApp.agent
      .post(`/api/v1/proposals/${created.id}/close`)
      .expect(200);

    expect(res.body.status).toBe('closed');
    expect(res.body.id).toBe(created.id);
  });

  // ---------------------------------------------------------------
  // 11. Resolve proposal (tallies votes, returns result)
  // ---------------------------------------------------------------
  it('resolves a closed proposal with vote tally', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);

    // Open -> vote -> close -> resolve
    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/open`)
      .expect(200);

    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/close`)
      .expect(200);

    const res = await testApp.agent
      .post(`/api/v1/proposals/${created.id}/resolve`)
      .expect(200);

    expect(res.body.status).toBe('resolved');
    expect(res.body.id).toBe(created.id);
  });

  // ---------------------------------------------------------------
  // 12. Delete proposal (soft delete, 204)
  // ---------------------------------------------------------------
  it('soft-deletes a proposal (204)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);

    await testApp.agent
      .delete(`/api/v1/proposals/${created.id}`)
      .expect(204);

    // Should no longer appear in list
    const listRes = await testApp.agent.get('/api/v1/proposals').expect(200);
    expect(listRes.body.proposals).toHaveLength(0);

    // Should 404 on direct get
    await testApp.agent
      .get(`/api/v1/proposals/${created.id}`)
      .expect(404);
  });
});
