import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Delegation Voting API', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  // ─── Create + Revoke ─────────────────────────────────────────────────

  it('creates a delegation (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/governance/delegations')
      .send({
        delegateeDid: 'did:web:delegate.example.com',
        scope: 'project',
      })
      .expect(201);

    expect(res.body.uri).toBeDefined();
    expect(res.body.delegateeDid).toBe('did:web:delegate.example.com');
    expect(res.body.scope).toBe('project');
    expect(res.body.status).toBe('active');
  });

  it('revokes a delegation (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/governance/delegations')
      .send({
        delegateeDid: 'did:web:delegate.example.com',
        scope: 'project',
      })
      .expect(201);

    const res = await testApp.agent
      .delete(
        `/api/v1/governance/delegations/${encodeURIComponent(createRes.body.uri)}`,
      )
      .expect(200);

    expect(res.body.status).toBe('revoked');
    expect(res.body.revokedAt).toBeDefined();
  });

  // ─── List ───────────────────────────────────────────────────────────

  it('lists delegations (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/governance/delegations')
      .send({
        delegateeDid: 'did:web:delegate1.example.com',
        scope: 'project',
      })
      .expect(201);

    await testApp.agent
      .post('/api/v1/governance/delegations')
      .send({
        delegateeDid: 'did:web:delegate2.example.com',
        scope: 'proposal',
        proposalUri: 'at://did:web:test/proposal/123',
      })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/governance/delegations')
      .expect(200);

    expect(res.body.delegations).toHaveLength(2);
  });

  it('lists delegations filtered by status (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/governance/delegations')
      .send({
        delegateeDid: 'did:web:delegate.example.com',
        scope: 'project',
      })
      .expect(201);

    // Revoke it
    await testApp.agent
      .delete(
        `/api/v1/governance/delegations/${encodeURIComponent(createRes.body.uri)}`,
      )
      .expect(200);

    const res = await testApp.agent
      .get('/api/v1/governance/delegations?status=active')
      .expect(200);

    // The first delegation was revoked and replaced, so there should be 0 active
    expect(res.body.delegations).toHaveLength(0);
  });

  // ─── Delegation Chain ───────────────────────────────────────────────

  it('gets delegation chain (200)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    // Admin delegates to delegate1
    await testApp.agent
      .post('/api/v1/governance/delegations')
      .send({
        delegateeDid: 'did:web:delegate1.example.com',
        scope: 'project',
      })
      .expect(201);

    const res = await testApp.agent
      .get(
        `/api/v1/governance/delegations/chain/${encodeURIComponent(adminDid)}?scope=project`,
      )
      .expect(200);

    expect(res.body.chain).toHaveLength(1);
    expect(res.body.chain[0].delegator_did).toBe(adminDid);
    expect(res.body.chain[0].delegatee_did).toBe(
      'did:web:delegate1.example.com',
    );
  });

  // ─── Circular Prevention ────────────────────────────────────────────

  it('prevents circular delegation (400)', async () => {
    const testApp = createTestApp();
    const { adminDid, coopDid } = await setupAndLogin(testApp);

    // Create a delegation from delegator→admin directly in DB to set up the cycle
    const db = testApp.container.db;
    const now = testApp.clock.now();
    const delegatorDid = 'did:web:delegator.example.com';

    await db
      .insertInto('delegation')
      .values({
        uri: `at://${coopDid}/network.coopsource.governance.delegation/cycle1`,
        did: coopDid,
        rkey: 'cycle1',
        project_uri: coopDid,
        delegator_did: delegatorDid,
        delegatee_did: adminDid,
        scope: 'project',
        status: 'active',
        created_at: now,
        indexed_at: now,
      })
      .execute();

    // Now try to delegate admin→delegator (would create a cycle)
    const res = await testApp.agent
      .post('/api/v1/governance/delegations')
      .send({
        delegateeDid: delegatorDid,
        scope: 'project',
      })
      .expect(400);

    expect(res.body.message).toContain('Circular delegation');
  });

  // ─── Vote Weight ────────────────────────────────────────────────────

  it('calculates vote weight (200)', async () => {
    const testApp = createTestApp();
    const { adminDid, coopDid } = await setupAndLogin(testApp);

    // Create a proposal first
    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Test Proposal',
        body: 'Test body',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    // Create delegation from another member → admin
    const db = testApp.container.db;
    const now = testApp.clock.now();
    const delegatorDid = 'did:web:delegator.example.com';

    await db
      .insertInto('delegation')
      .values({
        uri: `at://${coopDid}/network.coopsource.governance.delegation/weight1`,
        did: coopDid,
        rkey: 'weight1',
        project_uri: coopDid,
        delegator_did: delegatorDid,
        delegatee_did: adminDid,
        scope: 'project',
        status: 'active',
        created_at: now,
        indexed_at: now,
      })
      .execute();

    const res = await testApp.agent
      .get(
        `/api/v1/governance/vote-weight/${encodeURIComponent(adminDid)}?proposalId=${proposalRes.body.id}`,
      )
      .expect(200);

    // 1 (own) + 1 (delegator) = 2
    expect(res.body.weight).toBe(2);
  });

  // ─── Scope ──────────────────────────────────────────────────────────

  it('scopes delegation to proposal vs project (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Create project-level delegation
    const projectRes = await testApp.agent
      .post('/api/v1/governance/delegations')
      .send({
        delegateeDid: 'did:web:project-delegate.example.com',
        scope: 'project',
      })
      .expect(201);

    expect(projectRes.body.scope).toBe('project');
    expect(projectRes.body.proposalUri).toBeNull();

    // Create proposal-level delegation
    const proposalRes = await testApp.agent
      .post('/api/v1/governance/delegations')
      .send({
        delegateeDid: 'did:web:proposal-delegate.example.com',
        scope: 'proposal',
        proposalUri: 'at://did:web:test/proposal/456',
      })
      .expect(201);

    expect(proposalRes.body.scope).toBe('proposal');
    expect(proposalRes.body.proposalUri).toBe(
      'at://did:web:test/proposal/456',
    );
  });

  it('replaces existing active delegation in same scope (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // First delegation
    await testApp.agent
      .post('/api/v1/governance/delegations')
      .send({
        delegateeDid: 'did:web:first.example.com',
        scope: 'project',
      })
      .expect(201);

    // Second delegation in same scope replaces first
    await testApp.agent
      .post('/api/v1/governance/delegations')
      .send({
        delegateeDid: 'did:web:second.example.com',
        scope: 'project',
      })
      .expect(201);

    // Only 1 active delegation should exist
    const listRes = await testApp.agent
      .get('/api/v1/governance/delegations?status=active')
      .expect(200);

    expect(listRes.body.delegations).toHaveLength(1);
    expect(listRes.body.delegations[0].delegateeDid).toBe(
      'did:web:second.example.com',
    );
  });
});
