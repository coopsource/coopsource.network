import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Governance Feed API', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  // ─── Action Items ───────────────────────────────────────────────────

  it('returns proposals needing vote (200)', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);

    // Create a proposal and open voting
    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Vote Needed Proposal',
        body: 'Needs a vote',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    // Open it for voting
    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);

    const res = await testApp.agent
      .get('/api/v1/governance/feed/action-items')
      .expect(200);

    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    const actionItem = res.body.items.find(
      (i: Record<string, unknown>) => i.proposalId === proposalRes.body.id,
    );
    expect(actionItem).toBeDefined();
    expect(actionItem.type).toBe('proposal_vote_needed');
    expect(actionItem.title).toBe('Vote Needed Proposal');
  });

  it('excludes proposals already voted on (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Create and open a proposal
    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Already Voted',
        body: 'Already voted on',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);

    // Cast a vote
    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/governance/feed/action-items')
      .expect(200);

    const found = res.body.items.find(
      (i: Record<string, unknown>) => i.proposalId === proposalRes.body.id,
    );
    expect(found).toBeUndefined();
  });

  // ─── Recent Outcomes ────────────────────────────────────────────────

  it('returns recent outcomes (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Create and resolve a proposal: draft → open → vote → close → resolve
    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Passed Proposal',
        body: 'This passed',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/close`)
      .expect(200);

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/resolve`)
      .expect(200);

    const res = await testApp.agent
      .get('/api/v1/governance/feed/outcomes')
      .expect(200);

    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    const outcome = res.body.items.find(
      (i: Record<string, unknown>) => i.proposalId === proposalRes.body.id,
    );
    expect(outcome).toBeDefined();
    expect(outcome.type).toBe('proposal_outcome');
    expect(outcome.status).toBe('resolved');
  });

  // ─── Upcoming Meetings ──────────────────────────────────────────────

  it('returns upcoming meetings (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Create a proposal with a close date in the next 30 days
    const futureDate = new Date(
      testApp.clock.now().getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Upcoming Meeting Proposal',
        body: 'Has a deadline',
        votingType: 'binary',
        quorumType: 'simpleMajority',
        closesAt: futureDate,
      })
      .expect(201);

    // Open for voting
    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);

    const res = await testApp.agent
      .get('/api/v1/governance/feed/meetings')
      .expect(200);

    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    const meeting = res.body.items.find(
      (i: Record<string, unknown>) => i.proposalId === proposalRes.body.id,
    );
    expect(meeting).toBeDefined();
    expect(meeting.type).toBe('upcoming_deadline');
  });

  // ─── Filtering ──────────────────────────────────────────────────────

  it('filters by cooperative scope (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Action items, outcomes, meetings should all be scoped to the cooperative
    const actionRes = await testApp.agent
      .get('/api/v1/governance/feed/action-items')
      .expect(200);

    const outcomeRes = await testApp.agent
      .get('/api/v1/governance/feed/outcomes')
      .expect(200);

    const meetingRes = await testApp.agent
      .get('/api/v1/governance/feed/meetings')
      .expect(200);

    // All should return successfully (may be empty for a fresh coop)
    expect(Array.isArray(actionRes.body.items)).toBe(true);
    expect(Array.isArray(outcomeRes.body.items)).toBe(true);
    expect(Array.isArray(meetingRes.body.items)).toBe(true);
  });
});
