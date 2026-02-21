import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Threads & Posts', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  describe('POST /api/v1/threads', () => {
    it('creates a thread with default discussion type', async () => {
      const testApp = createTestApp();
      const { adminDid } = await setupAndLogin(testApp);

      const res = await testApp.agent
        .post('/api/v1/threads')
        .send({ title: 'First thread' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('First thread');
      expect(res.body.thread_type).toBe('discussion');
      expect(res.body.status).toBe('open');
      expect(res.body.created_by).toBe(adminDid);
      expect(res.body.cooperative_did).toBeDefined();
      expect(res.body.created_at).toBeDefined();
      expect(res.body.invalidated_at).toBeNull();
      expect(res.body.invalidated_by).toBeNull();
    });

    it('creates a thread with explicit announcement type', async () => {
      const testApp = createTestApp();
      await setupAndLogin(testApp);

      const res = await testApp.agent
        .post('/api/v1/threads')
        .send({ title: 'Announcements', threadType: 'announcement' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('Announcements');
      expect(res.body.thread_type).toBe('announcement');
      expect(res.body.status).toBe('open');
    });
  });

  describe('GET /api/v1/threads', () => {
    it('lists threads with items and cursor', async () => {
      const testApp = createTestApp();
      await setupAndLogin(testApp);

      // Create two threads (advance clock so ordering is deterministic)
      await testApp.agent
        .post('/api/v1/threads')
        .send({ title: 'Thread A' })
        .expect(201);
      testApp.clock.advance(1000);
      await testApp.agent
        .post('/api/v1/threads')
        .send({ title: 'Thread B' })
        .expect(201);

      const res = await testApp.agent
        .get('/api/v1/threads')
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body.items).toHaveLength(2);
      // Ordered by created_at desc, so Thread B should be first
      expect(res.body.items[0].title).toBe('Thread B');
      expect(res.body.items[1].title).toBe('Thread A');
    });
  });

  describe('GET /api/v1/threads/:id', () => {
    it('returns thread detail in camelCase with members array', async () => {
      const testApp = createTestApp();
      const { adminDid, coopDid } = await setupAndLogin(testApp);

      const createRes = await testApp.agent
        .post('/api/v1/threads')
        .send({ title: 'Detail thread' })
        .expect(201);

      const threadId = createRes.body.id;

      const res = await testApp.agent
        .get(`/api/v1/threads/${threadId}`)
        .expect(200);

      expect(res.body.id).toBe(threadId);
      expect(res.body.cooperativeDid).toBe(coopDid);
      expect(res.body.title).toBe('Detail thread');
      expect(res.body.threadType).toBe('discussion');
      expect(res.body.status).toBe('open');
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.createdBy).toBe(adminDid);
      expect(res.body.members).toBeInstanceOf(Array);
      expect(res.body.members).toContain(adminDid);
    });

    it('returns 404 for non-existent thread ID', async () => {
      const testApp = createTestApp();
      await setupAndLogin(testApp);

      const fakeId = '00000000-0000-0000-0000-000000000000';

      const res = await testApp.agent
        .get(`/api/v1/threads/${fakeId}`)
        .expect(404);

      expect(res.body.error).toBe('NotFound');
      expect(res.body.message).toBe('Thread not found');
    });
  });

  describe('POST /api/v1/threads/:id/posts', () => {
    it('creates a post in a thread', async () => {
      const testApp = createTestApp();
      const { adminDid } = await setupAndLogin(testApp);

      const threadRes = await testApp.agent
        .post('/api/v1/threads')
        .send({ title: 'Post thread' })
        .expect(201);

      const threadId = threadRes.body.id;

      const res = await testApp.agent
        .post(`/api/v1/threads/${threadId}/posts`)
        .send({ body: 'Hello, world!' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.thread_id).toBe(threadId);
      expect(res.body.author_did).toBe(adminDid);
      expect(res.body.body).toBe('Hello, world!');
      expect(res.body.body_format).toBe('plain');
      expect(res.body.parent_post_id).toBeNull();
      expect(res.body.status).toBe('active');
      expect(res.body.created_at).toBeDefined();
      expect(res.body.edited_at).toBeNull();
      expect(res.body.invalidated_at).toBeNull();
      expect(res.body.invalidated_by).toBeNull();
    });
  });

  describe('GET /api/v1/threads/:id/posts', () => {
    it('lists posts in a thread with items and cursor', async () => {
      const testApp = createTestApp();
      await setupAndLogin(testApp);

      const threadRes = await testApp.agent
        .post('/api/v1/threads')
        .send({ title: 'List posts thread' })
        .expect(201);

      const threadId = threadRes.body.id;

      await testApp.agent
        .post(`/api/v1/threads/${threadId}/posts`)
        .send({ body: 'First post' })
        .expect(201);
      testApp.clock.advance(1000);
      await testApp.agent
        .post(`/api/v1/threads/${threadId}/posts`)
        .send({ body: 'Second post' })
        .expect(201);

      const res = await testApp.agent
        .get(`/api/v1/threads/${threadId}/posts`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body.items).toHaveLength(2);
      // Posts are ordered by created_at asc
      expect(res.body.items[0].body).toBe('First post');
      expect(res.body.items[1].body).toBe('Second post');
    });
  });

  describe('PUT /api/v1/posts/:id', () => {
    it('updates the body of an existing post', async () => {
      const testApp = createTestApp();
      await setupAndLogin(testApp);

      const threadRes = await testApp.agent
        .post('/api/v1/threads')
        .send({ title: 'Edit thread' })
        .expect(201);

      const postRes = await testApp.agent
        .post(`/api/v1/threads/${threadRes.body.id}/posts`)
        .send({ body: 'Original body' })
        .expect(201);

      const postId = postRes.body.id;

      const res = await testApp.agent
        .put(`/api/v1/posts/${postId}`)
        .send({ body: 'Updated body' })
        .expect(200);

      expect(res.body.id).toBe(postId);
      expect(res.body.body).toBe('Updated body');
      expect(res.body.edited_at).not.toBeNull();
    });
  });

  describe('DELETE /api/v1/posts/:id', () => {
    it('deletes own post and returns 204', async () => {
      const testApp = createTestApp();
      await setupAndLogin(testApp);

      const threadRes = await testApp.agent
        .post('/api/v1/threads')
        .send({ title: 'Delete thread' })
        .expect(201);

      const postRes = await testApp.agent
        .post(`/api/v1/threads/${threadRes.body.id}/posts`)
        .send({ body: 'To be deleted' })
        .expect(201);

      const postId = postRes.body.id;

      await testApp.agent
        .delete(`/api/v1/posts/${postId}`)
        .expect(204);

      // Verify the post no longer appears in the thread's post list
      const listRes = await testApp.agent
        .get(`/api/v1/threads/${threadRes.body.id}/posts`)
        .expect(200);

      expect(listRes.body.items).toHaveLength(0);
    });

    it('returns 404 for non-existent post', async () => {
      const testApp = createTestApp();
      await setupAndLogin(testApp);

      const fakeId = '00000000-0000-0000-0000-000000000000';

      const res = await testApp.agent
        .delete(`/api/v1/posts/${fakeId}`)
        .expect(404);

      expect(res.body.error).toBe('NotFound');
      expect(res.body.message).toBe('Post not found');
    });
  });
});
