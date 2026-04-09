import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { createTestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

/**
 * V8.6 — Search service integration tests.
 *
 * Note: setupWithHandle and makeDiscoverable are LOCAL to this file (and to
 * explore.test.ts) — not shared in helpers/test-app.ts. The pattern is the same
 * as explore.test.ts; see plan finding §13 for the rationale.
 */

async function setupWithHandle(
  testApp: ReturnType<typeof createTestApp>,
  handle: string,
): Promise<{ coopDid: string; adminDid: string }> {
  resetSetupCache();

  const initRes = await testApp.agent
    .post('/api/v1/setup/initialize')
    .send({
      cooperativeName: 'Test Cooperative',
      cooperativeHandle: handle,
      adminEmail: 'admin@test.com',
      adminPassword: 'password123',
      adminDisplayName: 'Test Admin',
    })
    .expect(201);

  await testApp.agent
    .post('/api/v1/auth/login')
    .send({ email: 'admin@test.com', password: 'password123' })
    .expect(200);

  return {
    coopDid: initRes.body.coopDid,
    adminDid: initRes.body.adminDid,
  };
}

async function makeDiscoverable(coopDid: string): Promise<void> {
  const db = getTestDb();
  await db
    .updateTable('cooperative_profile')
    .set({ anon_discoverable: true })
    .where('entity_did', '=', coopDid)
    .execute();
}

async function setEntityFields(
  did: string,
  fields: { display_name?: string; description?: string | null; handle?: string | null },
): Promise<void> {
  const db = getTestDb();
  await db
    .updateTable('entity')
    .set(fields)
    .where('did', '=', did)
    .execute();
}

/**
 * V8.8 — Seed a candidate PERSON entity (optionally with a bio and/or
 * alignment interests) for people-search tests. Exercises the D1 hybrid
 * predicate in `SearchService.searchPeople`: a person is surfaced iff
 * `profile.discoverable = true` OR at least one `stakeholder_interest` row
 * exists for them.
 *
 * Duplicated (not shared) with me-matches.test.ts's helper because vitest
 * test files don't share module state cleanly across runs with
 * `isolate: false`, and the me-matches helper is private-to-file in the
 * V8.7 style. See explore.test.ts / search.test.ts existing precedent for
 * duplicating local fixture helpers.
 */
async function seedPerson(
  did: string,
  opts: {
    handle?: string | null;
    displayName?: string;
    bio?: string | null;
    discoverable?: boolean;
    interests?: Array<{ category: string; description?: string; priority?: number }>;
    createdAt?: Date;
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
      created_at: opts.createdAt ?? new Date(),
    })
    .execute();
  await db
    .insertInto('profile')
    .values({
      entity_did: did,
      is_default: true,
      display_name: displayName,
      bio: opts.bio ?? null,
      verified: true,
      discoverable: opts.discoverable ?? false,
    })
    .execute();
  if (opts.interests && opts.interests.length > 0) {
    const rkey = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await db
      .insertInto('stakeholder_interest')
      .values({
        uri: `at://${did}/network.coopsource.alignment.interest/${rkey}`,
        did,
        rkey,
        project_uri: did,
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
 * V8.8 — Seed a desired_outcome row directly against the schema. Alignment
 * tests use this to drop outcomes into the CTE that backs
 * `SearchService.searchAlignment`'s outcome_matches path without going
 * through the alignment-service (which would require PDS write ceremony
 * we don't want for a search-layer integration test).
 */
async function seedDesiredOutcome(
  coopDid: string,
  opts: {
    title: string;
    description?: string | null;
    category?: string;
    authorDid?: string;
  },
): Promise<void> {
  const db = getTestDb();
  const now = Date.now();
  const rkey = `test-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const authorDid = opts.authorDid ?? coopDid;
  await db
    .insertInto('desired_outcome')
    .values({
      uri: `at://${coopDid}/network.coopsource.alignment.outcome/${rkey}`,
      did: authorDid,
      rkey,
      project_uri: coopDid,
      title: opts.title,
      description: opts.description ?? null,
      category: opts.category ?? 'environmental',
      success_criteria: '[]',
      stakeholder_support: '[]',
      status: 'proposed',
      created_at: new Date(),
      indexed_at: new Date(),
    })
    .execute();
}

/**
 * V8.8 — Seed a `stakeholder_interest` row against a cooperative DID,
 * targeted as `project_uri = coopDid`. That's how `searchAlignment`
 * associates interest categories with the discoverable cooperative for
 * the interest_matches CTE — it groups stakeholder_interest rows by
 * project_uri and counts distinct categories that match the caller's
 * `?interests=` tag list.
 */
async function seedCoopInterests(
  coopDid: string,
  interests: Array<{ category: string; description?: string; priority?: number }>,
  opts: { authorDid?: string } = {},
): Promise<void> {
  const db = getTestDb();
  const authorDid = opts.authorDid ?? coopDid;
  const rkey = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db
    .insertInto('stakeholder_interest')
    .values({
      uri: `at://${authorDid}/network.coopsource.alignment.interest/${rkey}`,
      did: authorDid,
      rkey,
      project_uri: coopDid,
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

describe('Search', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  // ─── Cooperative search (anon-safe) ────────────────────────────────

  describe('GET /api/v1/search/cooperatives', () => {
    it('returns 200 with empty list for empty query', async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'test-coop');

      const res = await testApp.agent
        .get('/api/v1/search/cooperatives?q=')
        .expect(200);

      expect(res.body.cooperatives).toEqual([]);
      expect(res.body.cursor).toBeNull();
    });

    it('returns 200 with empty list for whitespace-only query', async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'test-coop');

      const res = await testApp.agent
        .get('/api/v1/search/cooperatives?q=%20%20')
        .expect(200);

      expect(res.body.cooperatives).toEqual([]);
    });

    it('returns only anon_discoverable cooperatives', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'visible-coop');
      await setEntityFields(coopDid, { display_name: 'Findable Coop' });
      await makeDiscoverable(coopDid);

      // Hidden coop with same search term — created via direct DB insert.
      const db = getTestDb();
      await db
        .insertInto('entity')
        .values({
          did: 'did:web:hidden.example',
          type: 'cooperative',
          display_name: 'Findable Hidden Coop',
          status: 'active',
          created_at: new Date(),
        })
        .execute();
      await db
        .insertInto('cooperative_profile')
        .values({
          entity_did: 'did:web:hidden.example',
          cooperative_type: 'worker',
          membership_policy: 'open',
          is_network: false,
          anon_discoverable: false, // hidden
        })
        .execute();

      const res = await testApp.agent
        .get('/api/v1/search/cooperatives?q=findable')
        .expect(200);

      expect(res.body.cooperatives).toHaveLength(1);
      expect(res.body.cooperatives[0].did).toBe(coopDid);
    });

    it('matches by display_name', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'name-coop');
      await setEntityFields(coopDid, { display_name: 'Sunshine Bakery Co-op' });
      await makeDiscoverable(coopDid);

      const res = await testApp.agent
        .get('/api/v1/search/cooperatives?q=sunshine')
        .expect(200);

      expect(res.body.cooperatives).toHaveLength(1);
      expect(res.body.cooperatives[0].displayName).toBe('Sunshine Bakery Co-op');
    });

    it('matches by description', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'desc-coop');
      await setEntityFields(coopDid, {
        display_name: 'Generic Co-op',
        description: 'We bake artisanal sourdough every morning',
      });
      await makeDiscoverable(coopDid);

      const res = await testApp.agent
        .get('/api/v1/search/cooperatives?q=sourdough')
        .expect(200);

      expect(res.body.cooperatives).toHaveLength(1);
    });

    it('matches by handle', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'unique-handle');
      await makeDiscoverable(coopDid);

      const res = await testApp.agent
        .get('/api/v1/search/cooperatives?q=unique')
        .expect(200);

      expect(res.body.cooperatives).toHaveLength(1);
      expect(res.body.cooperatives[0].handle).toBe('unique-handle');
    });

    it('supports websearch_to_tsquery quoted-phrase syntax', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'phrase-coop');
      await setEntityFields(coopDid, { display_name: 'Worker Owned Bakery' });
      await makeDiscoverable(coopDid);

      const res = await testApp.agent
        .get('/api/v1/search/cooperatives?q=' + encodeURIComponent('"worker owned"'))
        .expect(200);

      expect(res.body.cooperatives).toHaveLength(1);
    });

    it('supports websearch_to_tsquery OR operator', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'or-coop');
      await setEntityFields(coopDid, { display_name: 'Bakery Cooperative' });
      await makeDiscoverable(coopDid);

      const res = await testApp.agent
        .get('/api/v1/search/cooperatives?q=' + encodeURIComponent('butcher or bakery'))
        .expect(200);

      expect(res.body.cooperatives).toHaveLength(1);
    });

    it('supports websearch_to_tsquery exclusion operator', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'exclude-coop');
      await setEntityFields(coopDid, { display_name: 'Bakery Cooperative' });
      await makeDiscoverable(coopDid);

      // Exclude "bakery" — should match nothing
      const res = await testApp.agent
        .get('/api/v1/search/cooperatives?q=' + encodeURIComponent('cooperative -bakery'))
        .expect(200);

      expect(res.body.cooperatives).toEqual([]);
    });
  });

  // ─── Post search (authed) ──────────────────────────────────────────

  describe('GET /api/v1/search/posts', () => {
    it('returns 401 for unauthenticated request', async () => {
      const testApp = createTestApp();
      await testApp.agent.get('/api/v1/search/posts?q=anything').expect(401);
    });

    it('returns 200 with empty list for empty query when authed', async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'authed-coop');

      const res = await testApp.agent
        .get('/api/v1/search/posts?q=')
        .expect(200);

      expect(res.body.posts).toEqual([]);
      expect(res.body.cursor).toBeNull();
    });

    it('member sees their own thread posts', async () => {
      const testApp = createTestApp();
      const { coopDid, adminDid } = await setupWithHandle(testApp, 'member-coop');

      // Seed a thread + post via the service (admin is auto-added to thread_member)
      const thread = await testApp.container.postService.createThread({
        cooperativeDid: coopDid,
        createdByDid: adminDid,
        title: 'Test thread',
        threadType: 'discussion',
      });
      await testApp.container.postService.createPost({
        threadId: thread.id,
        authorDid: adminDid,
        body: 'The quick brown fox jumps over the lazy dog',
      });

      const res = await testApp.agent
        .get('/api/v1/search/posts?q=fox')
        .expect(200);

      expect(res.body.posts).toHaveLength(1);
      expect(res.body.posts[0].body).toContain('fox');
      expect(res.body.posts[0].cooperativeDid).toBe(coopDid);
    });

    it('non-thread-member does NOT see direct-thread posts even as a coop member (regression)', async () => {
      // This locks in the thread_member ACL. A is in a 'direct' thread that B is
      // not a thread_member of, even though both are members of the same coop.
      const testApp = createTestApp();
      const { coopDid, adminDid } = await setupWithHandle(testApp, 'acl-coop');

      // Add a second coop member B
      const db = getTestDb();
      const bDid = 'did:web:user-b.example';
      await db
        .insertInto('entity')
        .values({
          did: bDid,
          type: 'person',
          display_name: 'User B',
          status: 'active',
          created_at: new Date(),
        })
        .execute();
      const [bMembership] = await db
        .insertInto('membership')
        .values({
          member_did: bDid,
          cooperative_did: coopDid,
          status: 'active',
          joined_at: new Date(),
          created_at: new Date(),
        })
        .returning('id')
        .execute();
      // B authenticates with a password
      const { hash } = await import('bcrypt');
      const secret = await hash('passwordB', 4);
      await db
        .insertInto('auth_credential')
        .values({
          entity_did: bDid,
          credential_type: 'password',
          identifier: 'b@test.com',
          secret_hash: secret,
          created_at: new Date(),
        })
        .execute();
      await db
        .insertInto('membership_role')
        .values({ membership_id: bMembership!.id, role: 'member' })
        .execute();

      // A creates a direct thread that only A is a member of
      const directThread = await testApp.container.postService.createThread({
        cooperativeDid: coopDid,
        createdByDid: adminDid,
        title: 'Private chat',
        threadType: 'direct',
      });
      await testApp.container.postService.createPost({
        threadId: directThread.id,
        authorDid: adminDid,
        body: 'Confidential pineapple discussion',
      });

      // Log in as B and search. The supertest agent's existing admin
      // session cookie is overwritten by the Set-Cookie response from
      // /auth/login, so there's no need (and no endpoint) to explicitly
      // logout first. The login is the cookie swap.
      await testApp.agent
        .post('/api/v1/auth/login')
        .send({ email: 'b@test.com', password: 'passwordB' })
        .expect(200);

      const res = await testApp.agent
        .get('/api/v1/search/posts?q=pineapple')
        .expect(200);

      expect(res.body.posts).toEqual([]);
    });

    it('user does NOT see posts from coops they are not a member of', async () => {
      const testApp = createTestApp();
      const { coopDid, adminDid } = await setupWithHandle(testApp, 'cross-coop-a');

      // Create a second coop with its own admin and a post
      const db = getTestDb();
      const otherCoopDid = 'did:web:other-coop.example';
      const otherAdminDid = 'did:web:other-admin.example';
      await db
        .insertInto('entity')
        .values([
          {
            did: otherCoopDid,
            type: 'cooperative',
            display_name: 'Other Coop',
            status: 'active',
            created_at: new Date(),
          },
          {
            did: otherAdminDid,
            type: 'person',
            display_name: 'Other Admin',
            status: 'active',
            created_at: new Date(),
          },
        ])
        .execute();
      await db
        .insertInto('cooperative_profile')
        .values({
          entity_did: otherCoopDid,
          cooperative_type: 'worker',
          membership_policy: 'open',
          is_network: false,
          anon_discoverable: true,
        })
        .execute();
      const otherThread = await testApp.container.postService.createThread({
        cooperativeDid: otherCoopDid,
        createdByDid: otherAdminDid,
        title: "Other coop's thread",
        threadType: 'discussion',
      });
      await testApp.container.postService.createPost({
        threadId: otherThread.id,
        authorDid: otherAdminDid,
        body: 'Watermelon cultivation strategies',
      });

      // Logged in as 'cross-coop-a' admin, search for the term
      const res = await testApp.agent
        .get('/api/v1/search/posts?q=watermelon')
        .expect(200);

      expect(res.body.posts).toEqual([]);
      // sanity: the seed admin is a member of cross-coop-a only
      expect(adminDid).toBeDefined();
      expect(coopDid).toBeDefined();
    });

    it('edited posts ARE included in results (regression for status != deleted)', async () => {
      // PostService.updatePost does NOT set status='edited' today; the status
      // enum's 'edited' value is dead application code. Mutate the column
      // directly to lock in the SQL filter semantics.
      const testApp = createTestApp();
      const { coopDid, adminDid } = await setupWithHandle(testApp, 'edited-coop');

      const thread = await testApp.container.postService.createThread({
        cooperativeDid: coopDid,
        createdByDid: adminDid,
        threadType: 'discussion',
      });
      const post = await testApp.container.postService.createPost({
        threadId: thread.id,
        authorDid: adminDid,
        body: 'Original kumquat content',
      });

      // Direct DB UPDATE — see comment above for why
      const db = getTestDb();
      await db
        .updateTable('post')
        .set({ status: 'edited' })
        .where('id', '=', post.id)
        .execute();

      const res = await testApp.agent
        .get('/api/v1/search/posts?q=kumquat')
        .expect(200);

      expect(res.body.posts).toHaveLength(1);
      expect(res.body.posts[0].id).toBe(post.id);
    });

    it('deleted posts are excluded', async () => {
      const testApp = createTestApp();
      const { coopDid, adminDid } = await setupWithHandle(testApp, 'deleted-coop');

      const thread = await testApp.container.postService.createThread({
        cooperativeDid: coopDid,
        createdByDid: adminDid,
        threadType: 'discussion',
      });
      const post = await testApp.container.postService.createPost({
        threadId: thread.id,
        authorDid: adminDid,
        body: 'Soft-deleted papaya note',
      });

      const db = getTestDb();
      await db
        .updateTable('post')
        .set({ status: 'deleted' })
        .where('id', '=', post.id)
        .execute();

      const res = await testApp.agent
        .get('/api/v1/search/posts?q=papaya')
        .expect(200);

      expect(res.body.posts).toEqual([]);
    });

    it('invalidated posts are excluded', async () => {
      const testApp = createTestApp();
      const { coopDid, adminDid } = await setupWithHandle(testApp, 'invalidated-coop');

      const thread = await testApp.container.postService.createThread({
        cooperativeDid: coopDid,
        createdByDid: adminDid,
        threadType: 'discussion',
      });
      const post = await testApp.container.postService.createPost({
        threadId: thread.id,
        authorDid: adminDid,
        body: 'Tombstoned mango entry',
      });

      const db = getTestDb();
      await db
        .updateTable('post')
        .set({ invalidated_at: new Date() })
        .where('id', '=', post.id)
        .execute();

      const res = await testApp.agent
        .get('/api/v1/search/posts?q=mango')
        .expect(200);

      expect(res.body.posts).toEqual([]);
    });

    it('paginates with cursor across multiple matching posts', async () => {
      const testApp = createTestApp();
      const { coopDid, adminDid } = await setupWithHandle(testApp, 'pagination-coop');

      const thread = await testApp.container.postService.createThread({
        cooperativeDid: coopDid,
        createdByDid: adminDid,
        threadType: 'discussion',
      });

      // Insert 25 posts containing the same searchable term
      for (let i = 0; i < 25; i++) {
        await testApp.container.postService.createPost({
          threadId: thread.id,
          authorDid: adminDid,
          body: `Cherry blossom note number ${i}`,
        });
        testApp.clock.advance(1000); // Ensure distinct created_at
      }

      const page1 = await testApp.agent
        .get('/api/v1/search/posts?q=cherry&limit=10')
        .expect(200);

      expect(page1.body.posts).toHaveLength(10);
      expect(page1.body.cursor).toBeTruthy();

      const page2 = await testApp.agent
        .get(`/api/v1/search/posts?q=cherry&limit=10&cursor=${encodeURIComponent(page1.body.cursor)}`)
        .expect(200);

      expect(page2.body.posts).toHaveLength(10);
      // Distinct from page 1
      const page1Ids = new Set(page1.body.posts.map((p: { id: string }) => p.id));
      const page2Ids = new Set(page2.body.posts.map((p: { id: string }) => p.id));
      const overlap = [...page2Ids].filter((id) => page1Ids.has(id as string));
      expect(overlap).toEqual([]);
    });
  });

  // ─── V8.8 — People search (authed, D1 hybrid) ─────────────────────
  //
  // `searchPeople` enforces the discoverability rule in SQL:
  //   profile.discoverable = true
  //   OR EXISTS (stakeholder_interest record for this person)
  //
  // The load-bearing test here is the PRIVACY REGRESSION: a lurker
  // (no discoverable flag, no alignment data) must NEVER surface in
  // any authenticated user's people search. Breaking that assertion
  // would leak every account's existence.
  describe('GET /api/v1/search/people', () => {
    it('returns 401 for unauthenticated request', async () => {
      const testApp = createTestApp();
      await testApp.agent.get('/api/v1/search/people?q=anything').expect(401);
    });

    it('returns 200 with empty list for empty query when authed', async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'people-empty');

      const res = await testApp.agent
        .get('/api/v1/search/people?q=')
        .expect(200);

      expect(res.body.people).toEqual([]);
      expect(res.body.cursor).toBeNull();
    });

    it('returns 200 with empty list for whitespace-only query', async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'people-ws');

      const res = await testApp.agent
        .get('/api/v1/search/people?q=%20%20')
        .expect(200);

      expect(res.body.people).toEqual([]);
    });

    it('returns discoverable persons', async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'people-disc');

      await seedPerson('did:web:findable.example', {
        displayName: 'Findable Alice',
        discoverable: true,
      });

      const res = await testApp.agent
        .get('/api/v1/search/people?q=findable')
        .expect(200);

      expect(res.body.people).toHaveLength(1);
      expect(res.body.people[0].did).toBe('did:web:findable.example');
      expect(res.body.people[0].displayName).toBe('Findable Alice');
    });

    it('returns persons with alignment data even if discoverable=false (D1 hybrid)', async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'people-hybrid');

      await seedPerson('did:web:aligned-hidden.example', {
        displayName: 'Hybrid Bob',
        discoverable: false,
        interests: [{ category: 'climate', priority: 3 }],
      });

      const res = await testApp.agent
        .get('/api/v1/search/people?q=hybrid')
        .expect(200);

      expect(res.body.people).toHaveLength(1);
      expect(res.body.people[0].did).toBe('did:web:aligned-hidden.example');
    });

    it('PRIVACY REGRESSION: excludes persons with discoverable=false AND no alignment data', async () => {
      // This is the most important assertion in the people-search suite.
      // A lurker — no discoverable flag, no alignment data — must never
      // surface in a search result, even when their display_name exactly
      // matches the query.
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'people-lurker');

      await seedPerson('did:web:lurker-search.example', {
        displayName: 'Lurker Carla',
        discoverable: false,
        // No interests.
      });

      const res = await testApp.agent
        .get('/api/v1/search/people?q=lurker')
        .expect(200);

      expect(res.body.people).toEqual([]);
    });

    it('matches by display_name', async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'people-name');

      await seedPerson('did:web:named.example', {
        displayName: 'Quinoa Fanatic',
        discoverable: true,
      });

      const res = await testApp.agent
        .get('/api/v1/search/people?q=quinoa')
        .expect(200);

      expect(res.body.people).toHaveLength(1);
      expect(res.body.people[0].displayName).toBe('Quinoa Fanatic');
    });

    it('matches by handle', async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'people-handle');

      await seedPerson('did:web:handled.example', {
        handle: 'artichoke-fan',
        displayName: 'Some Name',
        discoverable: true,
      });

      const res = await testApp.agent
        .get('/api/v1/search/people?q=artichoke')
        .expect(200);

      expect(res.body.people).toHaveLength(1);
      expect(res.body.people[0].handle).toBe('artichoke-fan');
    });

    it('matches by bio (via profile_bio_tsv)', async () => {
      // The display_name / description path is indexed by the V8.6
      // `entity_search_tsv`; the bio path is V8.8's new
      // `profile.profile_bio_tsv`. The route OR-ands the two tsvectors
      // so a query that only matches the bio must still surface the
      // person.
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'people-bio');

      await seedPerson('did:web:bio-match.example', {
        displayName: 'Plain Name',
        bio: 'Passionate about tangerine cultivation in arid regions',
        discoverable: true,
      });

      const res = await testApp.agent
        .get('/api/v1/search/people?q=tangerine')
        .expect(200);

      expect(res.body.people).toHaveLength(1);
      expect(res.body.people[0].did).toBe('did:web:bio-match.example');
    });

    it('excludes self from search results', async () => {
      const testApp = createTestApp();
      const { adminDid } = await setupWithHandle(testApp, 'people-self');

      // Flip the admin's own profile to discoverable AND rename them so
      // their display_name matches the query term. The SearchService
      // must still exclude them via the `entity.did != viewerDid` filter.
      const db = getTestDb();
      await db
        .updateTable('entity')
        .set({ display_name: 'Selfie McTestface' })
        .where('did', '=', adminDid)
        .execute();
      await db
        .updateTable('profile')
        .set({ discoverable: true, display_name: 'Selfie McTestface' })
        .where('entity_did', '=', adminDid)
        .execute();

      const res = await testApp.agent
        .get('/api/v1/search/people?q=selfie')
        .expect(200);

      expect(res.body.people.find((p: { did: string }) => p.did === adminDid)).toBeUndefined();
    });

    it('paginates with cursor across multiple matching people', async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'people-page');

      // Seed 15 matching discoverable people. Vary created_at explicitly
      // because the cursor encodes (created_at, did) — identical
      // timestamps would collapse under the DESC ordering.
      const base = Date.now();
      for (let i = 0; i < 15; i++) {
        await seedPerson(`did:web:paged-${String(i).padStart(2, '0')}.example`, {
          displayName: `Paginated Dragon ${i}`,
          discoverable: true,
          createdAt: new Date(base - i * 1000),
        });
      }

      const page1 = await testApp.agent
        .get('/api/v1/search/people?q=dragon&limit=10')
        .expect(200);

      expect(page1.body.people).toHaveLength(10);
      expect(page1.body.cursor).toBeTruthy();

      const page2 = await testApp.agent
        .get(
          `/api/v1/search/people?q=dragon&limit=10&cursor=${encodeURIComponent(
            page1.body.cursor,
          )}`,
        )
        .expect(200);

      expect(page2.body.people).toHaveLength(5);
      const page1Dids = new Set(
        page1.body.people.map((p: { did: string }) => p.did),
      );
      const page2Dids = new Set(
        page2.body.people.map((p: { did: string }) => p.did),
      );
      const overlap = [...page2Dids].filter((d) => page1Dids.has(d as string));
      expect(overlap).toEqual([]);
    });
  });

  // ─── V8.8 — Alignment search (authed) ─────────────────────────────
  //
  // `searchAlignment` combines two CTE sources:
  //   - outcome_matches: FTS over desired_outcome.outcome_search_tsv
  //   - interest_matches: tag overlap via jsonb_array_elements on
  //     stakeholder_interest.interests
  //
  // Both are OR-combined; empty/whitespace q AND empty interests short-
  // circuit to an empty result. Cooperatives surface only when
  // `anon_discoverable = true` (belt-and-braces leak protection) and
  // only when the viewer is NOT already an active member.
  describe('GET /api/v1/search/alignment', () => {
    it('returns 401 for unauthenticated request', async () => {
      const testApp = createTestApp();
      await testApp.agent
        .get('/api/v1/search/alignment?q=anything')
        .expect(401);
    });

    it('returns 200 with empty list when neither q nor interests provided', async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'align-empty');

      const res = await testApp.agent
        .get('/api/v1/search/alignment')
        .expect(200);

      expect(res.body.cooperatives).toEqual([]);
      expect(res.body.cursor).toBeNull();
    });

    it('returns 200 with empty list when only empty interests are supplied', async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'align-ws');

      const res = await testApp.agent
        .get('/api/v1/search/alignment?interests=')
        .expect(200);

      expect(res.body.cooperatives).toEqual([]);
    });

    it("with q='climate resilience' returns coops whose desired_outcome matches", async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'align-q-coop');

      // Discoverable candidate coop (NOT the viewer's coop — that would
      // be filtered by the viewer-is-member exclusion).
      const targetCoop = 'did:web:align-target.example';
      const db = getTestDb();
      await db
        .insertInto('entity')
        .values({
          did: targetCoop,
          type: 'cooperative',
          display_name: 'Align Target Coop',
          status: 'active',
          created_at: new Date(),
        })
        .execute();
      await db
        .insertInto('cooperative_profile')
        .values({
          entity_did: targetCoop,
          cooperative_type: 'worker',
          membership_policy: 'open',
          is_network: false,
          anon_discoverable: true,
        })
        .execute();
      await seedDesiredOutcome(targetCoop, {
        title: 'Climate resilience planning',
        description: 'Our coop wants to help members prepare for climate change',
      });

      const res = await testApp.agent
        .get('/api/v1/search/alignment?q=' + encodeURIComponent('climate resilience'))
        .expect(200);

      expect(res.body.cooperatives).toHaveLength(1);
      expect(res.body.cooperatives[0].did).toBe(targetCoop);
      expect(res.body.cooperatives[0].matchedOutcomes).toBeGreaterThanOrEqual(1);
    });

    it('with interests=climate,food returns coops whose stakeholders mention those categories', async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'align-interests');

      const targetCoop = 'did:web:align-interest-target.example';
      const db = getTestDb();
      await db
        .insertInto('entity')
        .values({
          did: targetCoop,
          type: 'cooperative',
          display_name: 'Interest Target Coop',
          status: 'active',
          created_at: new Date(),
        })
        .execute();
      await db
        .insertInto('cooperative_profile')
        .values({
          entity_did: targetCoop,
          cooperative_type: 'worker',
          membership_policy: 'open',
          is_network: false,
          anon_discoverable: true,
        })
        .execute();
      await seedCoopInterests(targetCoop, [
        { category: 'climate', priority: 3 },
        { category: 'food', priority: 2 },
      ]);

      const res = await testApp.agent
        .get('/api/v1/search/alignment?interests=climate,food')
        .expect(200);

      expect(res.body.cooperatives).toHaveLength(1);
      expect(res.body.cooperatives[0].did).toBe(targetCoop);
      expect(res.body.cooperatives[0].matchedInterests).toBeGreaterThanOrEqual(1);
    });

    it('combined q + interests blends both signals', async () => {
      // Two candidate coops: A with an outcome matching q, B with
      // interests matching the tag list. The combined query should
      // return both, ordered by alignment_score DESC (the coop that
      // scores on BOTH paths wins if one exists, but here neither does;
      // we just verify both appear).
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'align-combined');

      const db = getTestDb();
      for (const did of [
        'did:web:combined-a.example',
        'did:web:combined-b.example',
      ]) {
        await db
          .insertInto('entity')
          .values({
            did,
            type: 'cooperative',
            display_name: `Combined ${did.slice(-10)}`,
            status: 'active',
            created_at: new Date(),
          })
          .execute();
        await db
          .insertInto('cooperative_profile')
          .values({
            entity_did: did,
            cooperative_type: 'worker',
            membership_policy: 'open',
            is_network: false,
            anon_discoverable: true,
          })
          .execute();
      }
      await seedDesiredOutcome('did:web:combined-a.example', {
        title: 'Mycelium research lab',
      });
      await seedCoopInterests('did:web:combined-b.example', [
        { category: 'climate', priority: 3 },
      ]);

      const res = await testApp.agent
        .get(
          '/api/v1/search/alignment?q=' +
            encodeURIComponent('mycelium') +
            '&interests=climate',
        )
        .expect(200);

      const dids = new Set(
        res.body.cooperatives.map((c: { did: string }) => c.did),
      );
      expect(dids.has('did:web:combined-a.example')).toBe(true);
      expect(dids.has('did:web:combined-b.example')).toBe(true);
    });

    it('PRIVACY REGRESSION: excludes non-anon_discoverable coops', async () => {
      // The route is auth-gated but the SQL still filters
      // `anon_discoverable = true` as belt-and-braces leak protection —
      // if a future product decision exposes an anon variant of this
      // endpoint, no schema change is required.
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'align-hidden');

      const hiddenCoop = 'did:web:align-hidden-target.example';
      const db = getTestDb();
      await db
        .insertInto('entity')
        .values({
          did: hiddenCoop,
          type: 'cooperative',
          display_name: 'Hidden Target Coop',
          status: 'active',
          created_at: new Date(),
        })
        .execute();
      await db
        .insertInto('cooperative_profile')
        .values({
          entity_did: hiddenCoop,
          cooperative_type: 'worker',
          membership_policy: 'open',
          is_network: false,
          anon_discoverable: false, // hidden
        })
        .execute();
      await seedDesiredOutcome(hiddenCoop, {
        title: 'Strawberry preservation workshop',
      });

      const res = await testApp.agent
        .get('/api/v1/search/alignment?q=strawberry')
        .expect(200);

      expect(res.body.cooperatives).toEqual([]);
    });

    it('excludes coops the viewer is already an active member of', async () => {
      // Seed an outcome on the viewer's OWN coop (the one
      // setupWithHandle created and made the admin a member of). The
      // viewer-is-member exclusion in searchAlignment should suppress
      // it even though the outcome FTS would otherwise match.
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'align-self-member');

      // Make the viewer's coop discoverable so the belt-and-braces
      // anon_discoverable filter would otherwise let it through.
      await makeDiscoverable(coopDid);
      await seedDesiredOutcome(coopDid, {
        title: 'Pineapple fermentation techniques',
      });

      const res = await testApp.agent
        .get('/api/v1/search/alignment?q=pineapple')
        .expect(200);

      expect(
        res.body.cooperatives.find((c: { did: string }) => c.did === coopDid),
      ).toBeUndefined();
    });

    it('interests parameter is case-insensitive', async () => {
      // The route lowercases the tag list on input and the CTE
      // lowercases the jsonb values. A stakeholder_interest row with
      // `{category: "Climate"}` must still match `?interests=climate`.
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'align-case');

      const targetCoop = 'did:web:align-case-target.example';
      const db = getTestDb();
      await db
        .insertInto('entity')
        .values({
          did: targetCoop,
          type: 'cooperative',
          display_name: 'Case Target Coop',
          status: 'active',
          created_at: new Date(),
        })
        .execute();
      await db
        .insertInto('cooperative_profile')
        .values({
          entity_did: targetCoop,
          cooperative_type: 'worker',
          membership_policy: 'open',
          is_network: false,
          anon_discoverable: true,
        })
        .execute();
      await seedCoopInterests(targetCoop, [
        { category: 'Climate', priority: 3 }, // mixed case
      ]);

      const res = await testApp.agent
        .get('/api/v1/search/alignment?interests=climate')
        .expect(200);

      expect(res.body.cooperatives).toHaveLength(1);
      expect(res.body.cooperatives[0].did).toBe(targetCoop);
    });
  });
});
