import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import type { TestApp } from './helpers/test-app.js';

describe('Auth Edge Cases', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
  });

  // ─── Login Validation ─────────────────────────────────────────────

  it('login with wrong password returns 401', async () => {
    await setupAndLogin(testApp);

    const freshApp = createTestApp();
    await freshApp.agent
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'wrongpassword' })
      .expect(401);
  });

  it('login with non-existent email returns 401', async () => {
    await setupAndLogin(testApp);

    const freshApp = createTestApp();
    await freshApp.agent
      .post('/api/v1/auth/login')
      .send({ email: 'nonexistent@test.com', password: 'password123' })
      .expect(401);
  });

  it('login with missing fields returns 400', async () => {
    await setupAndLogin(testApp);

    const freshApp = createTestApp();
    await freshApp.agent
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com' })
      .expect(400);
  });

  // ─── Session ──────────────────────────────────────────────────────

  it('logout without session returns 401', async () => {
    const unauthApp = createTestApp();
    await unauthApp.agent
      .delete('/api/v1/auth/session')
      .expect(401);
  });

  it('GET /auth/me without session returns 401', async () => {
    const unauthApp = createTestApp();
    await unauthApp.agent
      .get('/api/v1/auth/me')
      .expect(401);
  });
});
