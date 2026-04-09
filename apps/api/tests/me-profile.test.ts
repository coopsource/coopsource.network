import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import type { TestApp } from './helpers/test-app.js';

/**
 * V8.9 — PATCH /api/v1/me/profile route tests.
 *
 * The route accepts `{ discoverable?: boolean; dismissedGetStarted?: boolean }`
 * and requires at least one field. These tests exercise the HTTP layer to
 * complement the unit-level ProfileService tests in profile-service.test.ts.
 */

describe('PATCH /api/v1/me/profile', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
  });

  it('updates discoverable only (backward compat)', async () => {
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .patch('/api/v1/me/profile')
      .send({ discoverable: true })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.discoverable).toBe(true);
    expect(res.body.dismissedGetStarted).toBeUndefined();

    // Verify via GET
    const get = await testApp.agent.get('/api/v1/me/profile').expect(200);
    expect(get.body.profile.discoverable).toBe(true);
  });

  it('updates dismissedGetStarted only', async () => {
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .patch('/api/v1/me/profile')
      .send({ dismissedGetStarted: true })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.dismissedGetStarted).toBe(true);
    expect(res.body.discoverable).toBeUndefined();

    // Verify via GET
    const get = await testApp.agent.get('/api/v1/me/profile').expect(200);
    expect(get.body.profile.dismissedGetStarted).toBe(true);
  });

  it('updates both fields at once', async () => {
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .patch('/api/v1/me/profile')
      .send({ discoverable: true, dismissedGetStarted: true })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.discoverable).toBe(true);
    expect(res.body.dismissedGetStarted).toBe(true);
  });

  it('returns 400 when neither field is present', async () => {
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .patch('/api/v1/me/profile')
      .send({})
      .expect(400);

    expect(res.body.message).toMatch(/at least one of discoverable, dismissedGetStarted required/);
  });

  it('returns 400 when fields have wrong types', async () => {
    await setupAndLogin(testApp);

    await testApp.agent
      .patch('/api/v1/me/profile')
      .send({ discoverable: 'yes' })
      .expect(400);
  });

  it('requires authentication', async () => {
    // Don't log in — just try to PATCH
    const freshApp = createTestApp();

    await freshApp.agent
      .patch('/api/v1/me/profile')
      .send({ discoverable: true })
      .expect(401);
  });
});

describe('GET /api/v1/me/profile', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
  });

  it('returns the default profile with discoverable and dismissedGetStarted', async () => {
    await setupAndLogin(testApp);

    const res = await testApp.agent.get('/api/v1/me/profile').expect(200);

    expect(res.body.profile).toBeDefined();
    expect(res.body.profile.discoverable).toBe(false);
    expect(res.body.profile.dismissedGetStarted).toBe(false);
    expect(res.body.profile.displayName).toBe('Test Admin');
  });

  it('requires authentication', async () => {
    const freshApp = createTestApp();

    await freshApp.agent.get('/api/v1/me/profile').expect(401);
  });
});
