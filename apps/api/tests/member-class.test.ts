import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Member Class API', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  // ─── CRUD ────────────────────────────────────────────────────────────

  it('creates a member class (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/member-classes')
      .send({ name: 'worker', description: 'Worker members', voteWeight: 3 })
      .expect(201);

    expect(res.body.name).toBe('worker');
    expect(res.body.voteWeight).toBe(3);
    expect(res.body.quorumWeight).toBe(1);
    expect(res.body.boardSeats).toBe(0);
    expect(res.body.id).toBeDefined();
  });

  it('lists member classes (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/member-classes')
      .send({ name: 'worker', voteWeight: 3 })
      .expect(201);

    await testApp.agent
      .post('/api/v1/member-classes')
      .send({ name: 'investor', voteWeight: 1 })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/member-classes')
      .expect(200);

    expect(res.body.classes).toHaveLength(2);
  });

  it('gets a single member class (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/member-classes')
      .send({ name: 'worker', voteWeight: 5 })
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/member-classes/${createRes.body.id}`)
      .expect(200);

    expect(res.body.name).toBe('worker');
    expect(res.body.voteWeight).toBe(5);
  });

  it('updates a member class (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/member-classes')
      .send({ name: 'worker', voteWeight: 3 })
      .expect(201);

    const res = await testApp.agent
      .put(`/api/v1/member-classes/${createRes.body.id}`)
      .send({ voteWeight: 5, boardSeats: 2 })
      .expect(200);

    expect(res.body.voteWeight).toBe(5);
    expect(res.body.boardSeats).toBe(2);
  });

  it('deletes a member class (204)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/member-classes')
      .send({ name: 'worker' })
      .expect(201);

    await testApp.agent
      .delete(`/api/v1/member-classes/${createRes.body.id}`)
      .expect(204);

    // Verify it's gone
    await testApp.agent
      .get(`/api/v1/member-classes/${createRes.body.id}`)
      .expect(404);
  });

  // ─── Duplicate prevention ───────────────────────────────────────────

  it('rejects duplicate class name (409)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/member-classes')
      .send({ name: 'worker' })
      .expect(201);

    await testApp.agent
      .post('/api/v1/member-classes')
      .send({ name: 'worker' })
      .expect(409);
  });

  // ─── Delete guard ───────────────────────────────────────────────────

  it('blocks deleting class with assigned members (400)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    // Create a member class
    const classRes = await testApp.agent
      .post('/api/v1/member-classes')
      .send({ name: 'worker', voteWeight: 3 })
      .expect(201);

    // Assign admin to the class
    await testApp.agent
      .post('/api/v1/member-classes/assign')
      .send({ memberDid: adminDid, className: 'worker' })
      .expect(200);

    // Try to delete — should fail
    await testApp.agent
      .delete(`/api/v1/member-classes/${classRes.body.id}`)
      .expect(400);
  });

  // ─── Assign / Remove class ─────────────────────────────────────────

  it('assigns and removes member class (200)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/member-classes')
      .send({ name: 'worker', voteWeight: 3 })
      .expect(201);

    // Assign
    const assignRes = await testApp.agent
      .post('/api/v1/member-classes/assign')
      .send({ memberDid: adminDid, className: 'worker' })
      .expect(200);

    expect(assignRes.body.className).toBe('worker');

    // Remove
    const removeRes = await testApp.agent
      .delete(
        `/api/v1/member-classes/assign/${encodeURIComponent(adminDid)}`,
      )
      .expect(200);

    expect(removeRes.body.className).toBeNull();
  });

  // ─── Vote weight snapshot ──────────────────────────────────────────

  it('snapshots vote weight when casting vote', async () => {
    const testApp = createTestApp();
    const { adminDid, coopDid } = await setupAndLogin(testApp);

    // Create worker class with weight 5
    await testApp.agent
      .post('/api/v1/member-classes')
      .send({ name: 'worker', voteWeight: 5 })
      .expect(201);

    // Assign admin to worker class
    await testApp.agent
      .post('/api/v1/member-classes/assign')
      .send({ memberDid: adminDid, className: 'worker' })
      .expect(200);

    // Create a proposal
    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Test Weighted Vote',
        body: 'Testing weighted voting',
        votingType: 'binary',
        quorumType: 'unanimous',
      })
      .expect(201);

    // Open the proposal
    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);

    // Cast vote
    const voteRes = await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    expect(voteRes.body.voteWeight).toBe(5);
  });

  // ─── Weighted tally ────────────────────────────────────────────────

  it('returns weightedTally in votes endpoint', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Create proposal
    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Test',
        body: 'Test weighted tally',
        votingType: 'binary',
        quorumType: 'unanimous',
      })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    const votesRes = await testApp.agent
      .get(`/api/v1/proposals/${proposalRes.body.id}/votes`)
      .expect(200);

    expect(votesRes.body.tally).toBeDefined();
    expect(votesRes.body.weightedTally).toBeDefined();
    expect(votesRes.body.weightedTally.yes).toBeGreaterThanOrEqual(1);
  });

  // ─── Quorum bug fix ────────────────────────────────────────────────

  it('correctly checks simpleMajority quorum type', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Create proposal with simpleMajority quorum
    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Quorum Test',
        body: 'Testing fixed quorum check',
        votingType: 'binary',
        quorumType: 'simpleMajority',
        quorumThreshold: 0.5,
      })
      .expect(201);

    // Open, vote, close, resolve
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

    const resolveRes = await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/resolve`)
      .expect(200);

    // With 1 member and 1 vote, quorum should be met (1 > 1 * 0.5)
    expect(resolveRes.body.outcome).toBe('passed');
  });

  // ─── Backwards compat ──────────────────────────────────────────────

  it('defaults to weight 1 when no class configured', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Create proposal (no member classes set up)
    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'No Classes Test',
        body: 'Testing default weight',
        votingType: 'binary',
        quorumType: 'unanimous',
      })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);

    const voteRes = await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    expect(voteRes.body.voteWeight).toBe(1);
  });
});
