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
  fields: { display_name?: string; description?: string | null },
): Promise<void> {
  const db = getTestDb();
  await db
    .updateTable('entity')
    .set(fields)
    .where('did', '=', did)
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
});
