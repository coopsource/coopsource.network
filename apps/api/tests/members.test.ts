import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import { sseEmitter, type AppEvent } from '../src/appview/sse.js';
import type { TestApp } from './helpers/test-app.js';
import { AuthService } from '../src/services/auth-service.js';
import type { GroupMutationPort } from '@coopsource/arbiter-client';
import type { IPdsService } from '@coopsource/federation';

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

  // ─── directory visibility is opt-in and member-settable ──────────────

  it('PATCH /api/v1/members/me/visibility lets a member opt into the directory', async () => {
    const before = await testApp.container.db
      .selectFrom('membership')
      .where('member_did', '=', adminDid)
      .where('cooperative_did', '=', coopDid)
      .select('directory_visible')
      .executeTakeFirst();
    expect(before?.directory_visible).toBe(false); // opt-in default

    const res = await testApp.agent
      .patch('/api/v1/members/me/visibility')
      .send({ directoryVisible: true })
      .expect(200);
    expect(res.body.directoryVisible).toBe(true);

    const after = await testApp.container.db
      .selectFrom('membership')
      .where('member_did', '=', adminDid)
      .where('cooperative_did', '=', coopDid)
      .select('directory_visible')
      .executeTakeFirst();
    expect(after?.directory_visible).toBe(true);
  });

  it('PATCH /api/v1/members/me/visibility rejects a non-boolean value', async () => {
    await testApp.agent
      .patch('/api/v1/members/me/visibility')
      .send({ directoryVisible: 'yes' })
      .expect(400);
  });

  // ─── member roster filters to active by default ──────────────────────

  it('lists only active members by default; suspended are visible with ?status=suspended', async () => {
    const other = supertest.agent(testApp.app);
    const reg = await other
      .post('/api/v1/auth/register')
      .send({
        email: 'rostertest@test.com',
        password: 'password123',
        displayName: 'Roster',
      })
      .expect(201);
    const otherDid = reg.body.did as string;

    // Both active → both on the default roster.
    let list = (await testApp.agent.get('/api/v1/members').expect(200)).body
      .members;
    expect(list.map((m: { did: string }) => m.did)).toEqual(
      expect.arrayContaining([adminDid, otherDid]),
    );
    expect(list).toHaveLength(2);

    await testApp.agent
      .post(`/api/v1/members/${encodeURIComponent(otherDid)}/suspend`)
      .expect(204);

    // Default roster now excludes the suspended member (agrees with member count).
    list = (await testApp.agent.get('/api/v1/members').expect(200)).body
      .members;
    expect(list.map((m: { did: string }) => m.did)).toEqual([adminDid]);

    // ...but an admin can still list them explicitly.
    const suspended = (
      await testApp.agent.get('/api/v1/members?status=suspended').expect(200)
    ).body.members;
    expect(suspended.map((m: { did: string }) => m.did)).toEqual([otherDid]);
  });

  // ─── lifecycle events ────────────────────────────────────────────────

  it('emits member.joined on join and member.departed on removal', async () => {
    const events: AppEvent[] = [];
    const listener = (e: AppEvent) => events.push(e);
    sseEmitter.on('event', listener);
    try {
      const joiner = supertest.agent(testApp.app);
      const reg = await joiner
        .post('/api/v1/auth/register')
        .send({
          email: 'joiner@test.com',
          password: 'password123',
          displayName: 'Joiner',
        })
        .expect(201);
      const joinerDid = reg.body.did as string;

      const joined = events.filter((e) => e.type === 'member.joined');
      expect(joined).toHaveLength(1);
      expect(joined[0]!.data.did).toBe(joinerDid);
      expect(joined[0]!.cooperativeDid).toBe(coopDid);

      await testApp.agent
        .delete(`/api/v1/members/${encodeURIComponent(joinerDid)}`)
        .expect(204);

      const departed = events.filter((e) => e.type === 'member.departed');
      expect(departed).toHaveLength(1);
      expect(departed[0]!.data.did).toBe(joinerDid);
    } finally {
      sseEmitter.off('event', listener);
    }
  });

  // ─── suspend / reinstate a member ────────────────────────────────────

  it('suspends and reinstates a member, preserving the membership row', async () => {
    // A second active member to act on.
    const other = supertest.agent(testApp.app);
    const reg = await other
      .post('/api/v1/auth/register')
      .send({
        email: 'target@test.com',
        password: 'password123',
        displayName: 'Target',
      })
      .expect(201);
    const targetDid = reg.body.did as string;

    async function status() {
      const row = await testApp.container.db
        .selectFrom('membership')
        .where('member_did', '=', targetDid)
        .where('cooperative_did', '=', coopDid)
        .select(['status', 'invalidated_at'])
        .executeTakeFirst();
      return row;
    }
    expect((await status())?.status).toBe('active');

    await testApp.agent
      .post(`/api/v1/members/${encodeURIComponent(targetDid)}/suspend`)
      .send({ reason: 'under review' })
      .expect(204);
    const suspended = await status();
    expect(suspended?.status).toBe('suspended');
    expect(suspended?.invalidated_at).toBeNull(); // row preserved, not removed

    await testApp.agent
      .post(`/api/v1/members/${encodeURIComponent(targetDid)}/reinstate`)
      .expect(204);
    expect((await status())?.status).toBe('active');
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

  it('GET /api/v1/invitations/:token does not expose the full invitee email', async () => {
    const invRes = await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'secret@example.com', roles: ['member'] })
      .expect(201);

    const res = await supertest
      .agent(testApp.app)
      .get(`/api/v1/invitations/${invRes.body.token}`)
      .expect(200);

    expect(res.body.email).toBeNull();
    expect(res.body.emailHint).toMatch(/^s\*\*\*t@e\*\*\*\.com$/);
  });

  it('GET /api/v1/invitations/:token returns 404 after the invite is accepted', async () => {
    const invRes = await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'accepted-preview@example.com', roles: ['member'] })
      .expect(201);

    await supertest
      .agent(testApp.app)
      .post(`/api/v1/invitations/${invRes.body.token}/accept`)
      .send({
        email: 'accepted-preview@example.com',
        displayName: 'Accepted Preview',
        password: 'securepass123',
      })
      .expect(201);

    await supertest
      .agent(testApp.app)
      .get(`/api/v1/invitations/${invRes.body.token}`)
      .expect(404);
  });

  it('GET /api/v1/invitations/:token returns 404 after the invite expires', async () => {
    const invRes = await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'expired-preview@example.com', roles: ['member'] })
      .expect(201);

    await testApp.container.db
      .updateTable('invitation')
      .set({ expires_at: new Date(testApp.clock.nowMs() - 1000) })
      .where('token', '=', invRes.body.token as string)
      .execute();

    await supertest
      .agent(testApp.app)
      .get(`/api/v1/invitations/${invRes.body.token}`)
      .expect(404);
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
        email: 'bob@example.com',
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

  it('accepts an invitation only once (single-use)', async () => {
    const invRes = await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'once@example.com', roles: ['member'] })
      .expect(201);
    const token = invRes.body.token;

    await supertest
      .agent(testApp.app)
      .post(`/api/v1/invitations/${token}/accept`)
      .send({
        email: 'once@example.com',
        displayName: 'First',
        password: 'securepass123',
      })
      .expect(201);

    // A second redemption of the same token is refused.
    await supertest
      .agent(testApp.app)
      .post(`/api/v1/invitations/${token}/accept`)
      .send({
        email: 'once@example.com',
        displayName: 'Second',
        password: 'securepass123',
      })
      .expect(404);
  });

  it('accepts an invitation only once under concurrent redemption', async () => {
    const invRes = await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'race@example.com', roles: ['member'] })
      .expect(201);
    const token = invRes.body.token as string;

    const payload = {
      email: 'race@example.com',
      displayName: 'Race Winner',
      password: 'securepass123',
    };
    const attempts = await Promise.all([
      supertest
        .agent(testApp.app)
        .post(`/api/v1/invitations/${token}/accept`)
        .send(payload),
      supertest
        .agent(testApp.app)
        .post(`/api/v1/invitations/${token}/accept`)
        .send(payload),
    ]);

    const statuses = attempts.map((res) => res.status).sort();
    expect(statuses).toContain(201);
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(
      statuses.every((status) => [201, 400, 404, 409].includes(status)),
    ).toBe(true);

    const credentials = await testApp.container.db
      .selectFrom('auth_credential')
      .where('identifier', '=', 'race@example.com')
      .where('invalidated_at', 'is', null)
      .select(['entity_did'])
      .execute();
    expect(credentials).toHaveLength(1);

    const memberships = await testApp.container.db
      .selectFrom('membership')
      .where('cooperative_did', '=', coopDid)
      .where('member_did', '=', credentials[0].entity_did)
      .where('status', '=', 'active')
      .where('invalidated_at', 'is', null)
      .select(['id'])
      .execute();
    expect(memberships).toHaveLength(1);

    const invitation = await testApp.container.db
      .selectFrom('invitation')
      .where('token', '=', token)
      .select(['status', 'invitee_did', 'invalidated_at'])
      .executeTakeFirstOrThrow();
    expect(invitation.status).toBe('accepted');
    expect(invitation.invitee_did).toBe(credentials[0].entity_did);
    expect(invitation.invalidated_at).toBeNull();
  });

  it('does not create external PDS artifacts for the losing concurrent redemption', async () => {
    const invRes = await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'artifact-race@example.com', roles: ['member'] })
      .expect(201);
    const token = invRes.body.token as string;

    const countPdsRecords = async (collection: string): Promise<number> =>
      (
        await testApp.container.db
          .selectFrom('pds_record')
          .where('collection', '=', collection)
          .select('uri')
          .execute()
      ).length;

    const profileRecordsBefore = await countPdsRecords(
      'network.coopsource.actor.profile',
    );
    const consentRecordsBefore = await countPdsRecords(
      'network.coopsource.org.memberConsent',
    );

    const originalAuthService = testApp.container.authService;
    const delayedPds = new DelayedCreateDidPdsService(
      testApp.container.pdsService,
      75,
    );
    testApp.container.authService = new AuthService(
      testApp.container.db,
      delayedPds,
      testApp.container.clock,
      testApp.container.profileService,
      'http://localhost:3001',
      undefined,
      testApp.container.groupMutationsForDb,
      testApp.container.membershipReadModel,
    );

    let statuses: number[] = [];
    try {
      const payload = {
        email: 'artifact-race@example.com',
        displayName: 'Artifact Race',
        password: 'securepass123',
      };
      const attempts = await Promise.all([
        supertest
          .agent(testApp.app)
          .post(`/api/v1/invitations/${token}/accept`)
          .send(payload),
        supertest
          .agent(testApp.app)
          .post(`/api/v1/invitations/${token}/accept`)
          .send(payload),
      ]);
      statuses = attempts.map((res) => res.status).sort();
    } finally {
      testApp.container.authService = originalAuthService;
    }

    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(
      statuses.every((status) => [201, 400, 404, 409].includes(status)),
    ).toBe(true);
    expect(delayedPds.createDidCalls).toBe(1);
    expect(await countPdsRecords('network.coopsource.actor.profile')).toBe(
      profileRecordsBefore + 1,
    );
    expect(await countPdsRecords('network.coopsource.org.memberConsent')).toBe(
      consentRecordsBefore + 1,
    );
  });

  it('does not burn an invitation or create an account if membership authority rejects acceptance', async () => {
    const invRes = await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'rollback@example.com', roles: ['member'] })
      .expect(201);
    const token = invRes.body.token as string;

    const originalAuthService = testApp.container.authService;
    const failingGroupMutationsForDb: typeof testApp.container.groupMutationsForDb =
      (authorityDb) => {
        const base = testApp.container.groupMutationsForDb(authorityDb);
        return new Proxy(base, {
          get(target, prop, receiver) {
            if (prop === 'addMember') {
              const addMember: GroupMutationPort['addMember'] = async (
                args,
              ) => ({
                ok: false,
                changed: false,
                operation: 'add-member',
                cooperativeDid: args.cooperativeDid,
                memberDid: args.memberDid,
                reason: 'invalid-role',
              });
              return addMember;
            }
            const value = Reflect.get(target, prop, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }) as GroupMutationPort;
      };

    testApp.container.authService = new AuthService(
      testApp.container.db,
      testApp.container.pdsService,
      testApp.container.clock,
      testApp.container.profileService,
      'http://localhost:3001',
      undefined,
      failingGroupMutationsForDb,
      testApp.container.membershipReadModel,
    );

    try {
      await supertest
        .agent(testApp.app)
        .post(`/api/v1/invitations/${token}/accept`)
        .send({
          email: 'rollback@example.com',
          displayName: 'Rollback Invitee',
          password: 'securepass123',
        })
        .expect(400);
    } finally {
      testApp.container.authService = originalAuthService;
    }

    const invitation = await testApp.container.db
      .selectFrom('invitation')
      .where('token', '=', token)
      .select(['status', 'invitee_did', 'invalidated_at'])
      .executeTakeFirstOrThrow();
    expect(invitation.status).toBe('pending');
    expect(invitation.invitee_did).toBeNull();
    expect(invitation.invalidated_at).toBeNull();

    const credentials = await testApp.container.db
      .selectFrom('auth_credential')
      .where('identifier', '=', 'rollback@example.com')
      .where('invalidated_at', 'is', null)
      .select('id')
      .execute();
    expect(credentials).toHaveLength(0);

    const entities = await testApp.container.db
      .selectFrom('entity')
      .where('display_name', '=', 'Rollback Invitee')
      .select('did')
      .execute();
    expect(entities).toHaveLength(0);

    await supertest
      .agent(testApp.app)
      .post(`/api/v1/invitations/${token}/accept`)
      .send({
        email: 'rollback@example.com',
        displayName: 'Rollback Invitee',
        password: 'securepass123',
      })
      .expect(201);
  });

  it('rejects public invitation accept with a different email', async () => {
    const invRes = await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'right@example.com', roles: ['member'] })
      .expect(201);

    await supertest
      .agent(testApp.app)
      .post(`/api/v1/invitations/${invRes.body.token}/accept`)
      .send({
        email: 'wrong@example.com',
        displayName: 'Wrong Email',
        password: 'securepass123',
      })
      .expect(400);

    await supertest
      .agent(testApp.app)
      .post(`/api/v1/invitations/${invRes.body.token}/accept`)
      .send({
        email: 'right@example.com',
        displayName: 'Right Email',
        password: 'securepass123',
      })
      .expect(201);
  });

  it('rejects register with an invitation addressed to a different email', async () => {
    const invRes = await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'invited@example.com', roles: ['member'] })
      .expect(201);
    const token = invRes.body.token;

    // Wrong email cannot redeem an email-addressed invite (leaked-token guard).
    await supertest
      .agent(testApp.app)
      .post('/api/v1/auth/register')
      .send({
        email: 'attacker@example.com',
        password: 'password123',
        displayName: 'Mallory',
        invitationToken: token,
      })
      .expect(400);

    // The addressed email can, and the token is then single-use.
    await supertest
      .agent(testApp.app)
      .post('/api/v1/auth/register')
      .send({
        email: 'invited@example.com',
        password: 'password123',
        displayName: 'Invitee',
        invitationToken: token,
      })
      .expect(201);
    await supertest
      .agent(testApp.app)
      .post('/api/v1/auth/register')
      .send({
        email: 'invited@example.com',
        password: 'password123',
        displayName: 'Again',
        invitationToken: token,
      })
      .expect(400);
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
        email: 'carol@example.com',
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
        email: 'dave@example.com',
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
        email: 'eve@example.com',
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
        email: 'ghost@example.com',
        displayName: 'Ghost User',
        handle: 'ghost',
        password: 'securepass123',
      })
      .expect(404);

    expect(res.body.error).toBe('NotFound');
    expect(res.body.message).toMatch(/not found/i);
  });
});

class DelayedCreateDidPdsService implements IPdsService {
  createDidCalls = 0;

  constructor(
    private readonly inner: IPdsService,
    private readonly delayMs: number,
  ) {}

  async createDid(...args: Parameters<IPdsService['createDid']>) {
    this.createDidCalls += 1;
    await delay(this.delayMs);
    return this.inner.createDid(...args);
  }

  resolveDid(...args: Parameters<IPdsService['resolveDid']>) {
    return this.inner.resolveDid(...args);
  }

  updateDidDocument(...args: Parameters<IPdsService['updateDidDocument']>) {
    return this.inner.updateDidDocument(...args);
  }

  createRecord(...args: Parameters<IPdsService['createRecord']>) {
    return this.inner.createRecord(...args);
  }

  putRecord(...args: Parameters<IPdsService['putRecord']>) {
    return this.inner.putRecord(...args);
  }

  deleteRecord(...args: Parameters<IPdsService['deleteRecord']>) {
    return this.inner.deleteRecord(...args);
  }

  getRecord(...args: Parameters<IPdsService['getRecord']>) {
    return this.inner.getRecord(...args);
  }

  listRecords(...args: Parameters<IPdsService['listRecords']>) {
    return this.inner.listRecords(...args);
  }

  subscribeRepos(...args: Parameters<IPdsService['subscribeRepos']>) {
    return this.inner.subscribeRepos(...args);
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
