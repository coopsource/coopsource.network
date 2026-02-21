import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import type { TestApp } from './helpers/test-app.js';

describe('Members & Invitations', () => {
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

  // ─── 1. GET /api/v1/members returns admin member after setup ──────────

  it('GET /api/v1/members returns admin member after setup', async () => {
    const res = await testApp.agent.get('/api/v1/members').expect(200);

    expect(res.body.members).toHaveLength(1);
    expect(res.body.cursor).toBeNull();

    const admin = res.body.members[0];
    expect(admin.did).toBe(adminDid);
    expect(admin.displayName).toBe('Test Admin');
    expect(admin.email).toBe('admin@test.com');
    expect(admin.roles).toEqual(expect.arrayContaining(['owner', 'admin']));
    expect(admin.status).toBe('active');
    expect(admin.joinedAt).toBeTruthy();
    expect(admin.handle).toBeDefined();
  });

  // ─── 2. POST /api/v1/invitations creates invitation ──────────────────

  it('POST /api/v1/invitations creates invitation with token, email, roles', async () => {
    const res = await testApp.agent
      .post('/api/v1/invitations')
      .send({
        email: 'alice@example.com',
        roles: ['member'],
        message: 'Welcome to the co-op!',
      })
      .expect(201);

    expect(res.body.id).toBeTruthy();
    expect(res.body.token).toBeTruthy();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.email).toBe('alice@example.com');
    expect(res.body.roles).toEqual(['member']);
    expect(res.body.message).toBe('Welcome to the co-op!');
    expect(res.body.status).toBe('pending');
    expect(res.body.expiresAt).toBeTruthy();
    expect(res.body.createdAt).toBeTruthy();
    expect(res.body.invitedBy).toBe('Test Admin');
  });

  // ─── 3. POST /api/v1/invitations/:token/accept creates entity + membership ─

  it('POST /api/v1/invitations/:token/accept creates entity + membership', async () => {
    // Create invitation as admin
    const invRes = await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'bob@example.com', roles: ['member'] })
      .expect(201);

    const token = invRes.body.token;

    // Accept invitation using a fresh (unauthenticated) agent
    const publicAgent = supertest.agent(testApp.app);
    const acceptRes = await publicAgent
      .post(`/api/v1/invitations/${token}/accept`)
      .send({
        displayName: 'Bob Builder',
        handle: 'bob',
        password: 'securepass123',
      })
      .expect(201);

    expect(acceptRes.body.member).toBeTruthy();
    expect(acceptRes.body.member.did).toBeTruthy();
    expect(acceptRes.body.member.displayName).toBe('Bob Builder');
    expect(acceptRes.body.member.handle).toBe('bob');
    expect(acceptRes.body.member.email).toBe('bob@example.com');
    expect(acceptRes.body.member.roles).toEqual(['member']);
    expect(acceptRes.body.member.status).toBe('active');
    expect(acceptRes.body.member.joinedAt).toBeTruthy();
  });

  // ─── 4. GET /api/v1/members shows both members after invitation accept ─

  it('GET /api/v1/members shows both members after invitation accept', async () => {
    // Create and accept invitation
    const invRes = await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'carol@example.com', roles: ['member'] })
      .expect(201);

    const publicAgent = supertest.agent(testApp.app);
    await publicAgent
      .post(`/api/v1/invitations/${invRes.body.token}/accept`)
      .send({
        displayName: 'Carol Danvers',
        handle: 'carol',
        password: 'securepass123',
      })
      .expect(201);

    // List members as admin
    const res = await testApp.agent.get('/api/v1/members').expect(200);

    expect(res.body.members).toHaveLength(2);

    const dids = res.body.members.map((m: { did: string }) => m.did);
    expect(dids).toContain(adminDid);

    const carol = res.body.members.find(
      (m: { displayName: string }) => m.displayName === 'Carol Danvers',
    );
    expect(carol).toBeTruthy();
    expect(carol.email).toBe('carol@example.com');
    expect(carol.roles).toEqual(['member']);
    expect(carol.status).toBe('active');
  });

  // ─── 5. PUT /api/v1/members/:did/roles updates roles ─────────────────

  it('PUT /api/v1/members/:did/roles updates roles', async () => {
    // Create and accept invitation to get a second member
    const invRes = await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'dave@example.com', roles: ['member'] })
      .expect(201);

    const publicAgent = supertest.agent(testApp.app);
    const acceptRes = await publicAgent
      .post(`/api/v1/invitations/${invRes.body.token}/accept`)
      .send({
        displayName: 'Dave Grohl',
        handle: 'dave',
        password: 'securepass123',
      })
      .expect(201);

    const daveDid = acceptRes.body.member.did;

    // Update roles as admin
    await testApp.agent
      .put(`/api/v1/members/${daveDid}/roles`)
      .send({ roles: ['member', 'admin'] })
      .expect(200);

    // Verify roles were updated by fetching the member
    const membersRes = await testApp.agent.get('/api/v1/members').expect(200);

    const dave = membersRes.body.members.find(
      (m: { did: string }) => m.did === daveDid,
    );
    expect(dave).toBeTruthy();
    expect(dave.roles).toEqual(expect.arrayContaining(['member', 'admin']));
  });

  // ─── 6. DELETE /api/v1/members/:did soft-deletes membership ───────────

  it('DELETE /api/v1/members/:did soft-deletes membership (returns 204)', async () => {
    // Create and accept invitation
    const invRes = await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'eve@example.com', roles: ['member'] })
      .expect(201);

    const publicAgent = supertest.agent(testApp.app);
    const acceptRes = await publicAgent
      .post(`/api/v1/invitations/${invRes.body.token}/accept`)
      .send({
        displayName: 'Eve Torres',
        handle: 'eve',
        password: 'securepass123',
      })
      .expect(201);

    const eveDid = acceptRes.body.member.did;

    // Delete (soft-delete) the member as admin
    await testApp.agent.delete(`/api/v1/members/${eveDid}`).expect(204);

    // Verify member no longer appears in the list
    const membersRes = await testApp.agent.get('/api/v1/members').expect(200);
    const dids = membersRes.body.members.map((m: { did: string }) => m.did);
    expect(dids).not.toContain(eveDid);
  });

  // ─── 7. POST /api/v1/invitations rejects duplicate email ─────────────

  it('POST /api/v1/invitations rejects duplicate email', async () => {
    // Create first invitation
    await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'frank@example.com', roles: ['member'] })
      .expect(201);

    // Attempt to create a second invitation for the same email
    const res = await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'frank@example.com', roles: ['member'] })
      .expect(409);

    expect(res.body.error).toBe('Conflict');
    expect(res.body.message).toMatch(/already pending/i);
  });

  // ─── 8. Invitation accept with invalid token returns 404 ─────────────

  it('invitation accept with invalid token returns 404', async () => {
    const publicAgent = supertest.agent(testApp.app);
    const res = await publicAgent
      .post('/api/v1/invitations/nonexistent-token-abc123/accept')
      .send({
        displayName: 'Ghost User',
        handle: 'ghost',
        password: 'securepass123',
      })
      .expect(404);

    expect(res.body.error).toBe('NotFound');
    expect(res.body.message).toMatch(/not found/i);
  });
});
