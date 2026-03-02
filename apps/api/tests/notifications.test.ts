import { describe, it, expect, beforeEach } from 'vitest';
import {
  truncateAllTables,
  getTestDb,
} from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Notification API', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  async function setupWithNotifications(testApp: ReturnType<typeof createTestApp>) {
    const { coopDid, adminDid } = await setupAndLogin(testApp);

    const db = getTestDb();
    for (let i = 0; i < 3; i++) {
      await db
        .insertInto('notification')
        .values({
          cooperative_did: coopDid,
          recipient_did: adminDid,
          title: `Notification ${i}`,
          body: `Body ${i}`,
          category: 'automation',
          source_type: 'trigger',
          source_id: `trigger-${i}`,
        })
        .execute();
    }

    return { coopDid, adminDid };
  }

  it('lists notifications for current user (200)', async () => {
    const testApp = createTestApp();
    await setupWithNotifications(testApp);

    const res = await testApp.agent
      .get('/api/v1/notifications')
      .expect(200);

    expect(res.body.notifications).toHaveLength(3);
    expect(res.body.notifications[0].title).toBeDefined();
    expect(res.body.notifications[0].read).toBe(false);
  });

  it('returns unread count (200)', async () => {
    const testApp = createTestApp();
    await setupWithNotifications(testApp);

    const res = await testApp.agent
      .get('/api/v1/notifications/unread-count')
      .expect(200);

    expect(res.body.count).toBe(3);
  });

  it('marks single notification as read (200)', async () => {
    const testApp = createTestApp();
    await setupWithNotifications(testApp);

    const listRes = await testApp.agent
      .get('/api/v1/notifications')
      .expect(200);

    const notifId = listRes.body.notifications[0].id;

    await testApp.agent
      .put(`/api/v1/notifications/${notifId}/read`)
      .expect(200);

    const countRes = await testApp.agent
      .get('/api/v1/notifications/unread-count')
      .expect(200);

    expect(countRes.body.count).toBe(2);
  });

  it('marks all notifications as read (200)', async () => {
    const testApp = createTestApp();
    await setupWithNotifications(testApp);

    await testApp.agent
      .put('/api/v1/notifications/read-all')
      .expect(200);

    const countRes = await testApp.agent
      .get('/api/v1/notifications/unread-count')
      .expect(200);

    expect(countRes.body.count).toBe(0);
  });

  it('returns 404 for non-existent notification', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .put('/api/v1/notifications/00000000-0000-0000-0000-000000000000/read')
      .expect(404);
  });

  it('requires auth (401)', async () => {
    const testApp = createTestApp();

    await testApp.agent
      .get('/api/v1/notifications')
      .expect(401);
  });
});
