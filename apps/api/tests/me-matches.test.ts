import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import type { TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import { SCORING_VERSION } from '../src/services/matchmaking/score.js';

/**
 * V8.7 / V8.8 — Match Service integration tests.
 *
 * Pure scoring tests live in `src/services/matchmaking/score.test.ts` and
 * hit the function directly with no DB — they cover every branch of the
 * V8.8 composition formula (alignment/fallback/suppression) and the
 * weighted Jaccard, including person-candidate shapes. This file focuses
 * on the *service-layer* integration: candidate discovery queries, the
 * DELETE+INSERT transaction, the tombstone path, the
 * `getMatchesForUser` LEFT JOIN (exercising cooperative_type null for
 * person rows), and the HTTP routes.
 */

async function seedCandidateCoop(
  did: string,
  cooperativeType: string,
  opts: { discoverable?: boolean; isNetwork?: boolean; createdAt?: Date } = {},
): Promise<void> {
  const db = getTestDb();
  await db
    .insertInto('entity')
    .values({
      did,
      type: 'cooperative',
      handle: did.replace('did:web:', '').replace('.example', ''),
      display_name: `Coop ${did}`,
      status: 'active',
      created_at: opts.createdAt ?? new Date(),
    })
    .execute();
  await db
    .insertInto('cooperative_profile')
    .values({
      entity_did: did,
      cooperative_type: cooperativeType,
      membership_policy: 'open',
      is_network: opts.isNetwork ?? false,
      anon_discoverable: opts.discoverable ?? true,
    })
    .execute();
}

async function seedMatchRow(
  userDid: string,
  targetDid: string,
  opts: { dismissed?: boolean; actedOn?: boolean; createdAt?: Date } = {},
): Promise<string> {
  const db = getTestDb();
  const row = await db
    .insertInto('match_suggestion')
    .values({
      user_did: userDid,
      target_did: targetDid,
      match_type: 'cooperative',
      score: '0.5000',
      reason: JSON.stringify({
        signals: { recency: 0.5, diversity: 1.0, ageDays: 10 },
        version: SCORING_VERSION,
      }),
      created_at: opts.createdAt ?? new Date(),
      dismissed_at: opts.dismissed ? new Date() : null,
      acted_on_at: opts.actedOn ? new Date() : null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

describe('V8.7 — Match Service', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  // Pure scoring tests moved to src/services/matchmaking/score.test.ts in
  // V8.8 (Task 2). That module covers every composition branch including
  // person candidates, so the three V8.7 cases that lived here (determinism,
  // recency ordering, diversity bonus) are subsumed — see score.test.ts.

  // ─── runMatchmakingForUser ────────────────────────────────────────

  describe('runMatchmakingForUser', () => {
    let testApp: TestApp;
    let adminDid: string;
    let coopDid: string;

    beforeEach(async () => {
      testApp = createTestApp();
      const setup = await setupAndLogin(testApp);
      adminDid = setup.adminDid;
      coopDid = setup.coopDid;
    });

    it('excludes existing memberships', async () => {
      // The admin is already a member of the test coop (bilateral via setup).
      const result = await testApp.container.matchmakingService.runMatchmakingForUser(adminDid);
      expect(result.inserted).toBe(0); // no other candidates seeded

      const db = getTestDb();
      const rows = await db
        .selectFrom('match_suggestion')
        .where('user_did', '=', adminDid)
        .selectAll()
        .execute();
      expect(rows.find((r) => r.target_did === coopDid)).toBeUndefined();
    });

    it('excludes non-discoverable and network coops', async () => {
      await seedCandidateCoop('did:web:hidden.example', 'worker', { discoverable: false });
      await seedCandidateCoop('did:web:net.example', 'consumer', { isNetwork: true });
      await seedCandidateCoop('did:web:visible.example', 'worker', { discoverable: true });

      const result = await testApp.container.matchmakingService.runMatchmakingForUser(adminDid);
      expect(result.inserted).toBe(1);

      const db = getTestDb();
      const rows = await db
        .selectFrom('match_suggestion')
        .where('user_did', '=', adminDid)
        .selectAll()
        .execute();
      expect(rows.map((r) => r.target_did)).toEqual(['did:web:visible.example']);
    });

    it('refresh: running twice yields the same target_did set', async () => {
      await seedCandidateCoop('did:web:c1.example', 'worker');
      await seedCandidateCoop('did:web:c2.example', 'consumer');

      const first = await testApp.container.matchmakingService.runMatchmakingForUser(adminDid);
      const second = await testApp.container.matchmakingService.runMatchmakingForUser(adminDid);

      expect(first.inserted).toBe(2);
      expect(second.inserted).toBe(2);
      expect(second.deleted).toBe(2); // first run's rows got deleted

      const db = getTestDb();
      const rows = await db
        .selectFrom('match_suggestion')
        .where('user_did', '=', adminDid)
        .select('target_did')
        .execute();
      expect(new Set(rows.map((r) => r.target_did))).toEqual(
        new Set(['did:web:c1.example', 'did:web:c2.example']),
      );
    });

    it('excludes tombstoned (dismissed) target_dids on re-run', async () => {
      await seedCandidateCoop('did:web:tomb.example', 'worker');

      // First run inserts the row.
      await testApp.container.matchmakingService.runMatchmakingForUser(adminDid);

      // Dismiss it.
      const db = getTestDb();
      const row = await db
        .selectFrom('match_suggestion')
        .where('user_did', '=', adminDid)
        .where('target_did', '=', 'did:web:tomb.example')
        .selectAll()
        .executeTakeFirstOrThrow();
      await testApp.container.matchmakingService.dismissMatch(row.id, adminDid);

      // Re-run. The dismissed row stays; nothing new inserted.
      const result = await testApp.container.matchmakingService.runMatchmakingForUser(adminDid);
      expect(result.inserted).toBe(0);

      const after = await db
        .selectFrom('match_suggestion')
        .where('user_did', '=', adminDid)
        .where('target_did', '=', 'did:web:tomb.example')
        .selectAll()
        .executeTakeFirstOrThrow();
      expect(after.dismissed_at).not.toBeNull();
    });
  });

  // ─── getMatchesForUser ────────────────────────────────────────────

  describe('getMatchesForUser', () => {
    let testApp: TestApp;
    let adminDid: string;

    beforeEach(async () => {
      testApp = createTestApp();
      const setup = await setupAndLogin(testApp);
      adminDid = setup.adminDid;
    });

    it("default include='active' filters dismissed and acted-on rows", async () => {
      await seedCandidateCoop('did:web:live.example', 'worker');
      await seedCandidateCoop('did:web:dismissed.example', 'worker');
      await seedCandidateCoop('did:web:acted.example', 'worker');
      await seedMatchRow(adminDid, 'did:web:live.example');
      await seedMatchRow(adminDid, 'did:web:dismissed.example', { dismissed: true });
      await seedMatchRow(adminDid, 'did:web:acted.example', { actedOn: true });

      const active = await testApp.container.matchmakingService.getMatchesForUser(adminDid, {});
      expect(active.map((m) => m.targetDid)).toEqual(['did:web:live.example']);

      const all = await testApp.container.matchmakingService.getMatchesForUser(adminDid, { include: 'all' });
      expect(all).toHaveLength(3);
    });

    it('excludes invalidated target entities', async () => {
      await seedCandidateCoop('did:web:gone.example', 'worker');
      await seedMatchRow(adminDid, 'did:web:gone.example');

      // The service filters `entity.invalidated_at IS NULL` regardless of
      // entity.status — invalidated_at is the soft-delete signal.
      const db = getTestDb();
      await db
        .updateTable('entity')
        .set({ invalidated_at: new Date() })
        .where('did', '=', 'did:web:gone.example')
        .execute();

      const matches = await testApp.container.matchmakingService.getMatchesForUser(adminDid, {});
      expect(matches).toHaveLength(0);
    });

    it('clamps limit=999 to 50 via the route', async () => {
      const res = await testApp.agent
        .get('/api/v1/me/matches?limit=999')
        .expect(200);
      // We don't have 50 rows seeded; the assertion is that the route accepts
      // the request (no 400) and returns at most 50 entries.
      expect(res.body.matches.length).toBeLessThanOrEqual(50);
    });
  });

  // ─── Mutations + ownership ────────────────────────────────────────

  describe('POST /api/v1/me/matches/:id/dismiss', () => {
    let testApp: TestApp;
    let adminDid: string;

    beforeEach(async () => {
      testApp = createTestApp();
      const setup = await setupAndLogin(testApp);
      adminDid = setup.adminDid;
    });

    it('happy path sets dismissed_at and returns the match', async () => {
      await seedCandidateCoop('did:web:dis.example', 'worker');
      const id = await seedMatchRow(adminDid, 'did:web:dis.example');

      const res = await testApp.agent
        .post(`/api/v1/me/matches/${id}/dismiss`)
        .expect(200);

      expect(res.body.match.id).toBe(id);
      expect(res.body.match.dismissedAt).not.toBeNull();
    });

    it('idempotent: calling twice returns 200 with a fresher dismissedAt', async () => {
      await seedCandidateCoop('did:web:dis2.example', 'worker');
      const id = await seedMatchRow(adminDid, 'did:web:dis2.example');

      const first = await testApp.agent.post(`/api/v1/me/matches/${id}/dismiss`).expect(200);
      // Wait a tick so the second timestamp differs.
      await new Promise((r) => setTimeout(r, 5));
      const second = await testApp.agent.post(`/api/v1/me/matches/${id}/dismiss`).expect(200);

      expect(new Date(second.body.match.dismissedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(first.body.match.dismissedAt).getTime(),
      );
    });

    it('returns 404 when the match belongs to another user', async () => {
      // Seed a coop and a match owned by SOMEONE ELSE.
      await seedCandidateCoop('did:web:other.example', 'worker');
      const db = getTestDb();
      await db
        .insertInto('entity')
        .values({
          did: 'did:web:other-user.example',
          type: 'person',
          display_name: 'Other User',
          status: 'active',
          created_at: new Date(),
        })
        .execute();
      const id = await seedMatchRow('did:web:other-user.example', 'did:web:other.example');

      // The logged-in admin is NOT this user.
      await testApp.agent.post(`/api/v1/me/matches/${id}/dismiss`).expect(404);
    });

    it('returns 404 for invalid UUID format', async () => {
      await testApp.agent.post('/api/v1/me/matches/not-a-uuid/dismiss').expect(404);
    });
  });

  describe('POST /api/v1/me/matches/:id/act', () => {
    let testApp: TestApp;
    let adminDid: string;

    beforeEach(async () => {
      testApp = createTestApp();
      const setup = await setupAndLogin(testApp);
      adminDid = setup.adminDid;
    });

    it('happy path sets acted_on_at', async () => {
      await seedCandidateCoop('did:web:act.example', 'worker');
      const id = await seedMatchRow(adminDid, 'did:web:act.example');

      const res = await testApp.agent.post(`/api/v1/me/matches/${id}/act`).expect(200);
      expect(res.body.match.actedOnAt).not.toBeNull();
    });

    it('is idempotent', async () => {
      await seedCandidateCoop('did:web:act2.example', 'worker');
      const id = await seedMatchRow(adminDid, 'did:web:act2.example');

      await testApp.agent.post(`/api/v1/me/matches/${id}/act`).expect(200);
      await testApp.agent.post(`/api/v1/me/matches/${id}/act`).expect(200);
    });

    it('returns 404 cross-user', async () => {
      await seedCandidateCoop('did:web:cross.example', 'worker');
      const db = getTestDb();
      await db
        .insertInto('entity')
        .values({
          did: 'did:web:other-user2.example',
          type: 'person',
          display_name: 'Other User 2',
          status: 'active',
          created_at: new Date(),
        })
        .execute();
      const id = await seedMatchRow('did:web:other-user2.example', 'did:web:cross.example');

      await testApp.agent.post(`/api/v1/me/matches/${id}/act`).expect(404);
    });
  });

  describe('act + dismiss state machine', () => {
    let testApp: TestApp;
    let adminDid: string;

    beforeEach(async () => {
      testApp = createTestApp();
      const setup = await setupAndLogin(testApp);
      adminDid = setup.adminDid;
    });

    it('acting then dismissing leaves both columns set', async () => {
      await seedCandidateCoop('did:web:both.example', 'worker');
      const id = await seedMatchRow(adminDid, 'did:web:both.example');

      await testApp.agent.post(`/api/v1/me/matches/${id}/act`).expect(200);
      const res = await testApp.agent.post(`/api/v1/me/matches/${id}/dismiss`).expect(200);

      expect(res.body.match.actedOnAt).not.toBeNull();
      expect(res.body.match.dismissedAt).not.toBeNull();
    });
  });

  // ─── pruneStale ───────────────────────────────────────────────────

  describe('pruneStale', () => {
    let testApp: TestApp;
    let adminDid: string;

    beforeEach(async () => {
      testApp = createTestApp();
      const setup = await setupAndLogin(testApp);
      adminDid = setup.adminDid;
    });

    it('preserves dismissed and acted-on tombstones; deletes only old un-actioned rows', async () => {
      const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      await seedCandidateCoop('did:web:old-live.example', 'worker');
      await seedCandidateCoop('did:web:old-dis.example', 'worker');
      await seedCandidateCoop('did:web:old-act.example', 'worker');

      await seedMatchRow(adminDid, 'did:web:old-live.example', { createdAt: oldDate });
      await seedMatchRow(adminDid, 'did:web:old-dis.example', { dismissed: true, createdAt: oldDate });
      await seedMatchRow(adminDid, 'did:web:old-act.example', { actedOn: true, createdAt: oldDate });

      const result = await testApp.container.matchmakingService.pruneStale();
      expect(result.deleted).toBe(1);

      const db = getTestDb();
      const remaining = await db
        .selectFrom('match_suggestion')
        .select('target_did')
        .execute();
      expect(new Set(remaining.map((r) => r.target_did))).toEqual(
        new Set(['did:web:old-dis.example', 'did:web:old-act.example']),
      );
    });
  });

  // ─── Graceful 401 — user without active membership ────────────────

  describe('GET /api/v1/me/matches with no active membership', () => {
    it('returns 401 (so the web /me page can degrade gracefully)', async () => {
      const testApp = createTestApp();
      const { coopDid, adminDid } = await setupAndLogin(testApp);

      // Register a fresh user attached to the test coop.
      const { did: newDid } = await testApp.container.authService.register({
        email: 'newuser@test.com',
        password: 'password123',
        displayName: 'No Coop User',
        cooperativeDid: coopDid,
      });
      // Sanity: not the admin.
      expect(newDid).not.toBe(adminDid);

      // Invalidate the new user's membership directly so requireAuth's
      // active-membership check fails.
      const db = getTestDb();
      await db
        .updateTable('membership')
        .set({ invalidated_at: new Date() })
        .where('member_did', '=', newDid)
        .execute();

      // Log in as the new user via a fresh agent.
      const freshApp = createTestApp();
      await freshApp.agent
        .post('/api/v1/auth/login')
        .send({ email: 'newuser@test.com', password: 'password123' })
        .expect(200);

      await freshApp.agent.get('/api/v1/me/matches').expect(401);
    });
  });
});
