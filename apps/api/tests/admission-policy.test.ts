import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

/**
 * Audit finding S-02: setup stored a `membership_policy`, but the registration
 * path never read it — unauthenticated registration without an invitation
 * always created an active member with the `member` role, so an instance
 * recorded as invite-only was in fact open to anyone.
 */
describe('Cooperative admission policy (S-02)', () => {
  let testApp: TestApp;
  let coopDid: string;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
    const result = await setupAndLogin(testApp);
    coopDid = result.coopDid;
  });

  async function setPolicy(policy: string): Promise<void> {
    await getTestDb()
      .updateTable('cooperative_profile')
      .set({ membership_policy: policy })
      .where('entity_did', '=', coopDid)
      .execute();
  }

  function register(email: string, invitationToken?: string) {
    return supertest(testApp.app)
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'password123',
        displayName: 'Newcomer',
        handle: email.split('@')[0]!,
        ...(invitationToken ? { invitationToken } : {}),
      });
  }

  async function membershipStatus(email: string): Promise<string | undefined> {
    const row = await getTestDb()
      .selectFrom('auth_credential')
      .innerJoin('membership', 'membership.member_did', 'auth_credential.entity_did')
      .where('auth_credential.identifier', '=', email)
      .select('membership.status')
      .executeTakeFirst();
    return row?.status;
  }

  it('rejects uninvited registration when the policy is invite_only', async () => {
    await setPolicy('invite_only');

    const res = await register('uninvited@test.com');

    expect(res.status).toBe(403);
    expect(await membershipStatus('uninvited@test.com')).toBeUndefined();
  });

  it('accepts invited registration when the policy is invite_only', async () => {
    await setPolicy('invite_only');
    const invitation = await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'invited@test.com', roles: ['member'] })
      .expect(201);

    const res = await register('invited@test.com', invitation.body.token);

    expect(res.status).toBe(201);
    expect(await membershipStatus('invited@test.com')).toBe('active');
  });

  it('accepts uninvited registration when the policy is open', async () => {
    await setPolicy('open');

    const res = await register('open@test.com');

    expect(res.status).toBe(201);
    expect(await membershipStatus('open@test.com')).toBe('active');
  });

  it('creates a pending membership when the policy is request_approval', async () => {
    await setPolicy('request_approval');

    const res = await register('requester@test.com');

    expect(res.status).toBe(201);
    expect(await membershipStatus('requester@test.com')).toBe('pending');
  });

  it('setup stores the policy the operator chose', async () => {
    await truncateAllTables();
    resetSetupCache();
    const fresh = createTestApp();

    await supertest(fresh.app)
      .post('/api/v1/setup/initialize')
      .send({
        cooperativeName: 'Closed Coop',
        adminDisplayName: 'Admin',
        adminEmail: 'admin@closed.test',
        adminPassword: 'password123',
        membershipPolicy: 'invite_only',
      })
      .expect(201);

    const profile = await getTestDb()
      .selectFrom('cooperative_profile')
      .select('membership_policy')
      .executeTakeFirst();
    expect(profile?.membership_policy).toBe('invite_only');
  });

  it('an invitation still admits directly under request_approval', async () => {
    await setPolicy('request_approval');
    const invitation = await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'fasttrack@test.com', roles: ['member'] })
      .expect(201);

    await register('fasttrack@test.com', invitation.body.token).expect(201);

    expect(await membershipStatus('fasttrack@test.com')).toBe('active');
  });
});
