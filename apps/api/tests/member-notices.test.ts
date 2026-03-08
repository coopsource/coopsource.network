import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Member Notices', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('creates a member notice (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/admin/notices')
      .send({
        title: 'Annual Meeting Announcement',
        body: 'The annual meeting will be held on April 1, 2026.',
        noticeType: 'meeting',
        targetAudience: 'all',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Annual Meeting Announcement');
    expect(res.body.noticeType).toBe('meeting');
    expect(res.body.targetAudience).toBe('all');
    expect(res.body.sentAt).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
  });

  it('lists member notices with pagination', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/admin/notices')
      .send({ title: 'Notice 1', body: 'First notice', noticeType: 'general', targetAudience: 'all' })
      .expect(201);

    await testApp.agent
      .post('/api/v1/admin/notices')
      .send({ title: 'Notice 2', body: 'Second notice', noticeType: 'election', targetAudience: 'board' })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/admin/notices')
      .expect(200);

    expect(res.body.notices).toHaveLength(2);
    const titles = res.body.notices.map((n: { title: string }) => n.title);
    expect(titles).toContain('Notice 1');
    expect(titles).toContain('Notice 2');
  });

  it('validates required fields', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/admin/notices')
      .send({ title: 'Missing fields' })
      .expect(400);
  });

  it('supports all notice types', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    for (const noticeType of ['general', 'election', 'meeting', 'policy_change', 'other']) {
      const res = await testApp.agent
        .post('/api/v1/admin/notices')
        .send({ title: `${noticeType} notice`, body: 'Content', noticeType, targetAudience: 'all' })
        .expect(201);

      expect(res.body.noticeType).toBe(noticeType);
    }
  });
});
