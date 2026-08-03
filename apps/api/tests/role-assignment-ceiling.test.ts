import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

/**
 * Audit finding S-01: `coordinator` holds `member.roles.assign`, the endpoint
 * accepted arbitrary role strings for any member including the caller, and
 * `admin`/`owner` grant wildcard permissions — so a coordinator could promote
 * themselves to full authority. The invitation path had the same gap.
 */
async function createMemberWithRoles(
  testApp: TestApp,
  opts: { email: string; displayName: string; handle: string; password: string; roles: string[] },
): Promise<{ agent: supertest.Agent; did: string }> {
  const invRes = await testApp.agent
    .post('/api/v1/invitations')
    .send({ email: opts.email, roles: opts.roles })
    .expect(201);

  const memberAgent = supertest.agent(testApp.app);
  const acceptRes = await memberAgent
    .post(`/api/v1/invitations/${invRes.body.token}/accept`)
    .send({
      email: opts.email,
      displayName: opts.displayName,
      handle: opts.handle,
      password: opts.password,
    })
    .expect(201);

  await memberAgent
    .post('/api/v1/auth/login')
    .send({ email: opts.email, password: opts.password })
    .expect(200);

  return { agent: memberAgent, did: acceptRes.body.member.did };
}

describe('Role assignment ceiling (S-01)', () => {
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

  async function rolesOf(did: string): Promise<string[]> {
    const rows = await testApp.container.db
      .selectFrom('membership')
      .innerJoin('membership_role', 'membership_role.membership_id', 'membership.id')
      .where('membership.member_did', '=', did)
      .where('membership.cooperative_did', '=', coopDid)
      .select('membership_role.role')
      .execute();
    return rows.map((r) => r.role);
  }

  async function coordinator() {
    return createMemberWithRoles(testApp, {
      email: 'coord@test.com',
      displayName: 'Coord',
      handle: 'coord',
      password: 'password123',
      roles: ['coordinator'],
    });
  }

  for (const elevated of ['admin', 'owner']) {
    it(`a coordinator cannot promote themselves to ${elevated}`, async () => {
      const { agent, did } = await coordinator();

      const res = await agent.put(`/api/v1/members/${did}/roles`).send({ roles: [elevated] });

      expect(res.status).toBe(403);
      expect(await rolesOf(did)).not.toContain(elevated);
    });

    it(`a coordinator cannot promote another member to ${elevated}`, async () => {
      const { agent } = await coordinator();
      const target = await createMemberWithRoles(testApp, {
        email: 'target@test.com',
        displayName: 'Target',
        handle: 'target',
        password: 'password123',
        roles: ['member'],
      });

      const res = await agent
        .put(`/api/v1/members/${target.did}/roles`)
        .send({ roles: [elevated] });

      expect(res.status).toBe(403);
      expect(await rolesOf(target.did)).not.toContain(elevated);
    });

    it(`a coordinator cannot invite a new member as ${elevated}`, async () => {
      const { agent } = await coordinator();

      const res = await agent
        .post('/api/v1/invitations')
        .send({ email: 'escalate@test.com', roles: [elevated] });

      expect(res.status).toBe(403);
    });
  }

  it('a coordinator cannot strip an owner by assigning a lower role', async () => {
    const { agent } = await coordinator();
    const ownerDid = adminDid;

    const res = await agent.put(`/api/v1/members/${ownerDid}/roles`).send({ roles: ['member'] });

    expect(res.status).toBe(403);
    expect(await rolesOf(ownerDid)).toEqual(expect.arrayContaining(['owner', 'admin']));
  });

  it('a coordinator cannot strip an owner with an empty role array', async () => {
    const { agent } = await coordinator();
    const ownerDid = adminDid;

    const res = await agent.put(`/api/v1/members/${ownerDid}/roles`).send({ roles: [] });

    expect(res.status).toBe(403);
    expect(await rolesOf(ownerDid)).toEqual(expect.arrayContaining(['owner', 'admin']));
  });

  it('an owner can still demote another member', async () => {
    const target = await createMemberWithRoles(testApp, {
      email: 'demote@test.com',
      displayName: 'Demote',
      handle: 'demote',
      password: 'password123',
      roles: ['coordinator'],
    });

    await testApp.agent
      .put(`/api/v1/members/${target.did}/roles`)
      .send({ roles: ['member'] })
      .expect(200);

    expect(await rolesOf(target.did)).toEqual(['member']);
  });

  it('a coordinator can still demote a peer at or below their own level', async () => {
    const { agent } = await coordinator();
    const target = await createMemberWithRoles(testApp, {
      email: 'peerdemote@test.com',
      displayName: 'Peer',
      handle: 'peerdemote',
      password: 'password123',
      roles: ['coordinator'],
    });

    await agent.put(`/api/v1/members/${target.did}/roles`).send({ roles: ['member'] }).expect(200);

    expect(await rolesOf(target.did)).toEqual(['member']);
  });

  it('rejects unknown role names', async () => {
    const target = await createMemberWithRoles(testApp, {
      email: 'unknown@test.com',
      displayName: 'Unknown',
      handle: 'unknown',
      password: 'password123',
      roles: ['member'],
    });

    const res = await testApp.agent
      .put(`/api/v1/members/${target.did}/roles`)
      .send({ roles: ['not-a-real-role'] });

    expect(res.status).toBe(400);
    expect(await rolesOf(target.did)).not.toContain('not-a-real-role');
  });

  it('a coordinator can still assign roles at or below their own level', async () => {
    const { agent } = await coordinator();
    const target = await createMemberWithRoles(testApp, {
      email: 'peer@test.com',
      displayName: 'Peer',
      handle: 'peer',
      password: 'password123',
      roles: ['member'],
    });

    await agent.put(`/api/v1/members/${target.did}/roles`).send({ roles: ['coordinator'] }).expect(200);

    expect(await rolesOf(target.did)).toContain('coordinator');
  });

  it('an owner can still promote a member to admin', async () => {
    const target = await createMemberWithRoles(testApp, {
      email: 'promote@test.com',
      displayName: 'Promote',
      handle: 'promote',
      password: 'password123',
      roles: ['member'],
    });

    await testApp.agent
      .put(`/api/v1/members/${target.did}/roles`)
      .send({ roles: ['admin'] })
      .expect(200);

    expect(await rolesOf(target.did)).toContain('admin');
  });
});
