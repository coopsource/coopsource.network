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

/**
 * V8.8 — Seed a candidate PERSON entity (optionally with alignment interests)
 * for matchmaking tests. Exercises the D1 hybrid predicate in
 * `fetchPersonCandidates`: a person is included iff
 * `profile.discoverable = true` OR they have any `stakeholder_interest` row.
 *
 * The `projectUri` option lets a test route the candidate's interest record
 * at a specific cooperative DID so the `sharedCoopCount` signal can be
 * exercised; it defaults to the candidate's own DID which keeps shared-coop
 * counting at 0 (harmless for the common case).
 *
 * Uses a short random suffix on the stakeholder_interest rkey/uri because
 * a single test may seed multiple candidates within the same millisecond;
 * Date.now() alone is not unique enough.
 */
async function seedCandidatePerson(
  did: string,
  opts: {
    handle?: string;
    displayName?: string;
    discoverable?: boolean;
    interests?: Array<{ category: string; description?: string; priority?: number }>;
    projectUri?: string;
  } = {},
): Promise<void> {
  const db = getTestDb();
  const displayName = opts.displayName ?? `Person ${did.slice(-4)}`;
  await db
    .insertInto('entity')
    .values({
      did,
      type: 'person',
      handle: opts.handle ?? null,
      display_name: displayName,
      status: 'active',
      created_at: new Date(),
    })
    .execute();
  await db
    .insertInto('profile')
    .values({
      entity_did: did,
      is_default: true,
      display_name: displayName,
      verified: true,
      discoverable: opts.discoverable ?? false,
    })
    .execute();
  if (opts.interests && opts.interests.length > 0) {
    const projectUri = opts.projectUri ?? did;
    const rkey = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await db
      .insertInto('stakeholder_interest')
      .values({
        uri: `at://${did}/network.coopsource.alignment.interest/${rkey}`,
        did,
        rkey,
        project_uri: projectUri,
        interests: JSON.stringify(opts.interests),
        contributions: '[]',
        constraints: '[]',
        red_lines: '[]',
        preferences: '{}',
        created_at: new Date(),
        updated_at: new Date(),
        indexed_at: new Date(),
      })
      .execute();
  }
}

/**
 * V8.8 — Attach a `stakeholder_interest` row to ANY existing entity (a
 * person OR a cooperative). Used by the person-match tests to give the
 * viewer alignment data so the scoring function follows the alignment
 * branch instead of the V8.7 fallback, and also used to attach alignment
 * data to candidate cooperatives (matching how alignment-service.ts stores
 * them, scoped to a coop DID via project_uri). `projectUri` defaults to
 * the entity's own DID.
 */
async function seedInterestsFor(
  did: string,
  interests: Array<{ category: string; description?: string; priority?: number }>,
  opts: { projectUri?: string } = {},
): Promise<void> {
  const db = getTestDb();
  const projectUri = opts.projectUri ?? did;
  const rkey = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db
    .insertInto('stakeholder_interest')
    .values({
      uri: `at://${did}/network.coopsource.alignment.interest/${rkey}`,
      did,
      rkey,
      project_uri: projectUri,
      interests: JSON.stringify(interests),
      contributions: '[]',
      constraints: '[]',
      red_lines: '[]',
      preferences: '{}',
      created_at: new Date(),
      updated_at: new Date(),
      indexed_at: new Date(),
    })
    .execute();
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

  // ─── V8.8 — Person candidates ─────────────────────────────────────
  //
  // Exercises `fetchPersonCandidates` (D1 hybrid discoverability), the
  // single TOP_N cap across the cooperative + person pools, and the
  // `getMatchesForUser` LEFT JOIN which must leave `cooperativeType`
  // / `memberCount` null for person rows and populate
  // `sharedInterestCount` / `sharedCoopCount` from the persisted
  // `reason.signals` JSONB.
  //
  // The most load-bearing case here is the PRIVACY REGRESSION: a person
  // with `discoverable = false` AND no alignment data MUST NOT appear in
  // any other user's matches. See ARCHITECTURE-V8.md §V8.8 decision D1.
  describe('MatchmakingService person matches', () => {
    let testApp: TestApp;
    let adminDid: string;

    beforeEach(async () => {
      testApp = createTestApp();
      const setup = await setupAndLogin(testApp);
      adminDid = setup.adminDid;
    });

    it('discoverable person appears in matches', async () => {
      await seedCandidatePerson('did:web:disc-person.example', {
        displayName: 'Discoverable Person',
        discoverable: true,
      });

      await testApp.container.matchmakingService.runMatchmakingForUser(adminDid);

      const matches = await testApp.container.matchmakingService.getMatchesForUser(
        adminDid,
        {},
      );
      const person = matches.find(
        (m) => m.targetDid === 'did:web:disc-person.example',
      );
      expect(person).toBeDefined();
      expect(person!.matchType).toBe('person');
      expect(person!.cooperativeType).toBeNull();
      expect(person!.memberCount).toBeNull();
      // Person has no interests, admin has no interests → fallback branch
      // → sharedCategoryCount=0.
      expect(person!.sharedInterestCount).toBe(0);
      expect(person!.sharedCoopCount).toBe(0);
    });

    it('person with alignment data but discoverable=false appears in matches (D1 hybrid)', async () => {
      // Seed admin alignment data so the alignment branch of the scoring
      // function fires — otherwise a no-overlap person with no
      // discoverable flag could pass for the wrong reason (the user-has-
      // no-alignment fallback). This test locks in that alignment data is
      // itself the opt-in signal.
      await seedInterestsFor(adminDid, [
        { category: 'climate', priority: 3 },
      ]);
      await seedCandidatePerson('did:web:hidden-aligned.example', {
        displayName: 'Hidden but Aligned',
        discoverable: false,
        interests: [{ category: 'climate', priority: 3 }],
      });

      await testApp.container.matchmakingService.runMatchmakingForUser(adminDid);

      const matches = await testApp.container.matchmakingService.getMatchesForUser(
        adminDid,
        {},
      );
      const person = matches.find(
        (m) => m.targetDid === 'did:web:hidden-aligned.example',
      );
      expect(person).toBeDefined();
      expect(person!.matchType).toBe('person');
      // Alignment branch fired → shared category count 1.
      expect(person!.sharedInterestCount).toBe(1);
    });

    it('PRIVACY REGRESSION: person with discoverable=false and no alignment data is excluded', async () => {
      // This is the most important assertion in the person-match suite.
      // A lurker — someone who has a profile but has neither opted in via
      // the discoverable flag nor participated in alignment data — must
      // NEVER surface on another user's matches list. Breaking this would
      // leak the mere existence of every platform account to every other
      // user.
      await seedCandidatePerson('did:web:lurker.example', {
        displayName: 'Lurker',
        discoverable: false,
      });

      await testApp.container.matchmakingService.runMatchmakingForUser(adminDid);

      const matches = await testApp.container.matchmakingService.getMatchesForUser(
        adminDid,
        { include: 'all' },
      );
      expect(
        matches.find((m) => m.targetDid === 'did:web:lurker.example'),
      ).toBeUndefined();
    });

    it('person matching excludes self', async () => {
      // Flip the admin's own profile to discoverable + seed alignment
      // data. Running matchmaking must not suggest the admin to
      // themselves (even though their profile/alignment now matches the
      // D1 hybrid predicate).
      const db = getTestDb();
      await db
        .updateTable('profile')
        .set({ discoverable: true })
        .where('entity_did', '=', adminDid)
        .execute();
      await seedInterestsFor(adminDid, [{ category: 'food', priority: 4 }]);

      await testApp.container.matchmakingService.runMatchmakingForUser(adminDid);

      const matches = await testApp.container.matchmakingService.getMatchesForUser(
        adminDid,
        { include: 'all' },
      );
      expect(matches.find((m) => m.targetDid === adminDid)).toBeUndefined();
    });

    it('person matching excludes tombstones (dismiss + act)', async () => {
      await seedCandidatePerson('did:web:tomb-dismiss.example', {
        displayName: 'To Dismiss',
        discoverable: true,
      });
      await seedCandidatePerson('did:web:tomb-act.example', {
        displayName: 'To Act',
        discoverable: true,
      });

      // Initial run inserts both.
      await testApp.container.matchmakingService.runMatchmakingForUser(adminDid);
      const initial = await testApp.container.matchmakingService.getMatchesForUser(
        adminDid,
        {},
      );
      const dismissRow = initial.find(
        (m) => m.targetDid === 'did:web:tomb-dismiss.example',
      );
      const actRow = initial.find(
        (m) => m.targetDid === 'did:web:tomb-act.example',
      );
      expect(dismissRow).toBeDefined();
      expect(actRow).toBeDefined();

      // Dismiss one, act on the other.
      await testApp.container.matchmakingService.dismissMatch(
        dismissRow!.id,
        adminDid,
      );
      await testApp.container.matchmakingService.markActedOn(
        actRow!.id,
        adminDid,
      );

      // Re-run — both persons should be filtered from the active set
      // by the tombstone NOT IN subquery in `fetchPersonCandidates`.
      await testApp.container.matchmakingService.runMatchmakingForUser(adminDid);
      const afterRerun =
        await testApp.container.matchmakingService.getMatchesForUser(adminDid, {});
      expect(
        afterRerun.find((m) => m.targetDid === 'did:web:tomb-dismiss.example'),
      ).toBeUndefined();
      expect(
        afterRerun.find((m) => m.targetDid === 'did:web:tomb-act.example'),
      ).toBeUndefined();
    });

    it('getMatchesForUser returns mixed cooperative and person rows with correct shape', async () => {
      // Give admin alignment data so the scoring branch is deterministic.
      await seedInterestsFor(adminDid, [
        { category: 'climate', priority: 3 },
      ]);
      // Person with matching alignment.
      await seedCandidatePerson('did:web:person-mix.example', {
        displayName: 'Aligned Person',
        discoverable: true,
        interests: [{ category: 'climate', priority: 3 }],
      });
      // Cooperative with matching alignment — seeded directly so we can
      // also attach a stakeholder_interest row scoped to the coop DID via
      // project_uri (matches how alignment-service.ts stores them).
      await seedCandidateCoop('did:web:coop-mix.example', 'worker');
      await seedInterestsFor('did:web:coop-mix.example', [
        { category: 'climate', priority: 3 },
      ]);

      await testApp.container.matchmakingService.runMatchmakingForUser(adminDid);

      const matches = await testApp.container.matchmakingService.getMatchesForUser(
        adminDid,
        {},
      );
      const person = matches.find(
        (m) => m.targetDid === 'did:web:person-mix.example',
      );
      const coop = matches.find((m) => m.targetDid === 'did:web:coop-mix.example');

      expect(person).toBeDefined();
      expect(person!.matchType).toBe('person');
      expect(person!.cooperativeType).toBeNull();
      expect(person!.memberCount).toBeNull();
      expect(person!.sharedInterestCount).toBe(1);

      expect(coop).toBeDefined();
      expect(coop!.matchType).toBe('cooperative');
      expect(coop!.cooperativeType).toBe('worker');
      expect(coop!.sharedInterestCount).toBeNull();
      expect(coop!.sharedCoopCount).toBeNull();
    });

    it('mixed TOP_N: highest 20 win regardless of type', async () => {
      // 15 coops + 15 persons, all discoverable. TOP_N = 20 means 10 of
      // the 30 candidates are dropped. The assertion is just that the
      // table ends up with exactly 20 rows — the scoring order is not
      // deterministic when all candidates have identical signals, and
      // locking in a specific split would couple the test to the tie-
      // breaker rules in score.ts. Count is the load-bearing invariant.
      for (let i = 0; i < 15; i++) {
        await seedCandidateCoop(`did:web:topn-coop-${i}.example`, 'worker');
      }
      for (let i = 0; i < 15; i++) {
        await seedCandidatePerson(`did:web:topn-person-${i}.example`, {
          displayName: `TopN Person ${i}`,
          discoverable: true,
        });
      }

      const result = await testApp.container.matchmakingService.runMatchmakingForUser(
        adminDid,
      );
      expect(result.inserted).toBe(20);

      const db = getTestDb();
      const rows = await db
        .selectFrom('match_suggestion')
        .where('user_did', '=', adminDid)
        .selectAll()
        .execute();
      expect(rows).toHaveLength(20);

      // Sanity: the winning 20 must include BOTH match types. This catches
      // a future refactor that accidentally treats one type as always
      // score-0 and silently excludes it from the TOP_N.
      const rowsByType = rows.reduce(
        (acc, r) => {
          acc[r.match_type] = (acc[r.match_type] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
      expect(rowsByType.cooperative ?? 0).toBeGreaterThan(0);
      expect(rowsByType.person ?? 0).toBeGreaterThan(0);
    });

    it('backward compat: empty user interests + empty candidate interests falls back to V8.7 formula', async () => {
      // Admin has NO stakeholder_interest rows. A fresh coop candidate
      // with no interests should still appear via the V8.7 fallback
      // branch (`recency * diversity`) — new accounts must not see an
      // empty matches list just because the alignment layer hasn't been
      // populated yet.
      await seedCandidateCoop('did:web:fallback-coop.example', 'worker');

      await testApp.container.matchmakingService.runMatchmakingForUser(adminDid);

      const matches = await testApp.container.matchmakingService.getMatchesForUser(
        adminDid,
        {},
      );
      expect(
        matches.find((m) => m.targetDid === 'did:web:fallback-coop.example'),
      ).toBeDefined();
    });

    it('SUPPRESSION: candidate with no alignment gets score 0 and ranks below scored candidates', async () => {
      // Viewer has alignment data.
      await seedInterestsFor(adminDid, [
        { category: 'climate', priority: 3 },
      ]);
      // Candidate A: matching alignment → scored > 0 via alignment branch.
      await seedCandidateCoop('did:web:aligned-coop.example', 'worker');
      await seedInterestsFor('did:web:aligned-coop.example', [
        { category: 'climate', priority: 3 },
      ]);
      // Candidate B: no alignment → score.ts routes to the suppression
      // branch (user has alignment data, candidate doesn't) → score = 0.
      await seedCandidateCoop('did:web:no-align-coop.example', 'consumer');

      await testApp.container.matchmakingService.runMatchmakingForUser(adminDid);

      // Both are technically within TOP_N=20, so BOTH get inserted — the
      // suppression is about ranking, not hard exclusion. What we lock
      // in here is that the aligned one outranks the no-alignment one
      // and that the no-alignment row records score=0 in its persisted
      // signals (via reason.signals.alignment === 0).
      const matches = await testApp.container.matchmakingService.getMatchesForUser(
        adminDid,
        {},
      );
      const aligned = matches.find(
        (m) => m.targetDid === 'did:web:aligned-coop.example',
      );
      const unaligned = matches.find(
        (m) => m.targetDid === 'did:web:no-align-coop.example',
      );
      expect(aligned).toBeDefined();
      expect(unaligned).toBeDefined();
      // Aligned candidate scores strictly higher than the suppressed one.
      expect(Number(aligned!.score)).toBeGreaterThan(Number(unaligned!.score));
      // The suppressed candidate's raw score is 0.0000.
      expect(Number(unaligned!.score)).toBe(0);
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
