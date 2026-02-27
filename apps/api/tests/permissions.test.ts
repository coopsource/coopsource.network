import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import type { TestApp } from './helpers/test-app.js';

/**
 * Helper: invite a user, accept, login, and return an authenticated agent.
 */
async function createMemberWithRoles(
  testApp: TestApp,
  opts: {
    email: string;
    displayName: string;
    handle: string;
    password: string;
    roles: string[];
  },
): Promise<{ agent: supertest.Agent; did: string }> {
  // Admin creates invitation
  const invRes = await testApp.agent
    .post('/api/v1/invitations')
    .send({ email: opts.email, roles: opts.roles })
    .expect(201);

  // Accept invitation with a fresh (unauthenticated) agent
  const memberAgent = supertest.agent(testApp.app);
  const acceptRes = await memberAgent
    .post(`/api/v1/invitations/${invRes.body.token}/accept`)
    .send({
      displayName: opts.displayName,
      handle: opts.handle,
      password: opts.password,
    })
    .expect(201);

  // Login explicitly to get session
  await memberAgent
    .post('/api/v1/auth/login')
    .send({ email: opts.email, password: opts.password })
    .expect(200);

  return { agent: memberAgent, did: acceptRes.body.member.did };
}

describe('Permissions System', () => {
  let testApp: TestApp;
  let coopDid: string;
  let adminDid: string;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
    const result = await setupAndLogin(testApp);
    coopDid = result.coopDid;
    adminDid = result.adminDid;
  });

  // ─── Built-in role seeding ────────────────────────────────────────

  it('seeds built-in role definitions during setup', async () => {
    const roles = await testApp.container.db
      .selectFrom('role_definition')
      .where('cooperative_did', '=', coopDid)
      .select(['name', 'is_builtin', 'permissions', 'inherits'])
      .orderBy('name')
      .execute();

    expect(roles).toHaveLength(4);

    const roleNames = roles.map((r) => r.name);
    expect(roleNames).toEqual(
      expect.arrayContaining(['admin', 'coordinator', 'member', 'observer']),
    );

    // All are built-in
    for (const role of roles) {
      expect(role.is_builtin).toBe(true);
    }

    // Admin has wildcard
    const admin = roles.find((r) => r.name === 'admin')!;
    expect(admin.permissions).toEqual(['*']);

    // Coordinator inherits member
    const coordinator = roles.find((r) => r.name === 'coordinator')!;
    expect(coordinator.inherits).toEqual(['member']);
  });

  // ─── Admin (wildcard) access ──────────────────────────────────────

  it('admin can access all restricted endpoints', async () => {
    // Admin can create proposals (proposal.create)
    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Admin proposal',
        body: 'Testing admin access',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    expect(proposalRes.body.title).toBe('Admin proposal');

    // Admin can update cooperative settings (coop.settings.edit)
    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ displayName: 'Updated Co-op' })
      .expect(200);

    // Admin can create invitation (member.invite)
    await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'test@example.com', roles: ['member'] })
      .expect(201);
  });

  // ─── Member role permissions ──────────────────────────────────────

  it('member can create proposals but not open/close them', async () => {
    const { agent: memberAgent } = await createMemberWithRoles(testApp, {
      email: 'alice@example.com',
      displayName: 'Alice',
      handle: 'alice',
      password: 'password123',
      roles: ['member'],
    });

    // Member CAN create proposals (proposal.create granted to member role)
    const proposalRes = await memberAgent
      .post('/api/v1/proposals')
      .send({
        title: 'Member proposal',
        body: 'Testing member permissions',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    // Member CANNOT open proposals (proposal.open not in member permissions)
    const openRes = await memberAgent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(403);

    expect(openRes.body.error.code).toBe('FORBIDDEN');
    expect(openRes.body.error.required).toBe('proposal.open');
  });

  it('member can cast votes on open proposals', async () => {
    // Admin creates and opens a proposal
    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Voting test',
        body: 'Test body',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);

    // Create a member
    const { agent: memberAgent } = await createMemberWithRoles(testApp, {
      email: 'bob@example.com',
      displayName: 'Bob',
      handle: 'bob',
      password: 'password123',
      roles: ['member'],
    });

    // Member CAN vote (vote.cast granted to member role)
    const voteRes = await memberAgent
      .post(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    expect(voteRes.body.choice).toBe('yes');
  });

  it('member cannot create invitations', async () => {
    const { agent: memberAgent } = await createMemberWithRoles(testApp, {
      email: 'carol@example.com',
      displayName: 'Carol',
      handle: 'carol',
      password: 'password123',
      roles: ['member'],
    });

    // Member CANNOT create invitations (member.invite not in member permissions)
    const res = await memberAgent
      .post('/api/v1/invitations')
      .send({ email: 'new@example.com', roles: ['member'] })
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.required).toBe('member.invite');
  });

  // ─── Observer role permissions ────────────────────────────────────

  it('observer can vote but not create proposals', async () => {
    // Admin creates and opens a proposal
    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Observer test',
        body: 'Test body',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);

    // Create an observer
    const { agent: observerAgent } = await createMemberWithRoles(testApp, {
      email: 'observer@example.com',
      displayName: 'Observer',
      handle: 'observer',
      password: 'password123',
      roles: ['observer'],
    });

    // Observer CAN vote (vote.cast granted to observer role)
    const voteRes = await observerAgent
      .post(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .send({ choice: 'no' })
      .expect(201);

    expect(voteRes.body.choice).toBe('no');

    // Observer CANNOT create proposals
    const propRes = await observerAgent
      .post('/api/v1/proposals')
      .send({
        title: 'Observer proposal',
        body: 'Should be rejected',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(403);

    expect(propRes.body.error.required).toBe('proposal.create');
  });

  // ─── Coordinator role (with inheritance) ──────────────────────────

  it('coordinator inherits member permissions and has its own', async () => {
    const { agent: coordAgent } = await createMemberWithRoles(testApp, {
      email: 'coord@example.com',
      displayName: 'Coordinator',
      handle: 'coord',
      password: 'password123',
      roles: ['coordinator'],
    });

    // Coordinator CAN create invitations (member.invite in coordinator)
    await coordAgent
      .post('/api/v1/invitations')
      .send({ email: 'invited@example.com', roles: ['member'] })
      .expect(201);

    // Coordinator CAN create proposals (proposal.create inherited from member)
    const proposalRes = await coordAgent
      .post('/api/v1/proposals')
      .send({
        title: 'Coordinator proposal',
        body: 'Testing inheritance',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    expect(proposalRes.body.title).toBe('Coordinator proposal');

    // Coordinator CAN open proposals (proposal.open in coordinator)
    await coordAgent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);

    // Coordinator CANNOT manage billing (coop.billing.manage not granted)
    // (No endpoint exists for this yet, so we test via settings as proxy)
    // Coordinator CAN edit coop settings (coop.settings.edit in coordinator)
    await coordAgent
      .put('/api/v1/cooperative')
      .send({ displayName: 'Coord Updated' })
      .expect(200);
  });

  // ─── Unauthenticated requests ─────────────────────────────────────

  it('unauthenticated requests return 401', async () => {
    const publicAgent = supertest.agent(testApp.app);

    await publicAgent.get('/api/v1/proposals').expect(401);
    await publicAgent.post('/api/v1/proposals').send({}).expect(401);
    await publicAgent.get('/api/v1/members').expect(401);
  });

  // ─── Permission denied response format ────────────────────────────

  it('permission denied returns 403 with required field', async () => {
    const { agent: memberAgent } = await createMemberWithRoles(testApp, {
      email: 'denied@example.com',
      displayName: 'Denied User',
      handle: 'denied',
      password: 'password123',
      roles: ['member'],
    });

    const res = await memberAgent
      .put('/api/v1/cooperative')
      .send({ displayName: 'Unauthorized Change' })
      .expect(403);

    expect(res.body.error).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Insufficient permissions',
      required: 'coop.settings.edit',
    });
  });

  // ─── Member role: post creation ───────────────────────────────────

  it('member can create threads and posts', async () => {
    const { agent: memberAgent } = await createMemberWithRoles(testApp, {
      email: 'poster@example.com',
      displayName: 'Poster',
      handle: 'poster',
      password: 'password123',
      roles: ['member'],
    });

    // Member CAN create threads (post.create in member role)
    const threadRes = await memberAgent
      .post('/api/v1/threads')
      .send({ title: 'New thread', threadType: 'discussion' })
      .expect(201);

    expect(threadRes.body.title).toBe('New thread');
  });

  it('observer cannot create threads', async () => {
    const { agent: observerAgent } = await createMemberWithRoles(testApp, {
      email: 'obs2@example.com',
      displayName: 'Observer2',
      handle: 'obs2',
      password: 'password123',
      roles: ['observer'],
    });

    const res = await observerAgent
      .post('/api/v1/threads')
      .send({ title: 'Should fail', threadType: 'discussion' })
      .expect(403);

    expect(res.body.error.required).toBe('post.create');
  });

  // ─── Agreement permissions ────────────────────────────────────────

  it('member cannot create agreements (requires agreement.create)', async () => {
    const { agent: memberAgent } = await createMemberWithRoles(testApp, {
      email: 'agreemember@example.com',
      displayName: 'Agreement Member',
      handle: 'agreemember',
      password: 'password123',
      roles: ['member'],
    });

    const res = await memberAgent
      .post('/api/v1/agreements')
      .send({
        title: 'Test agreement',
        projectUri: 'at://fake/proj/1',
        agreementType: 'contributor',
      })
      .expect(403);

    expect(res.body.error.required).toBe('agreement.create');
  });
});
