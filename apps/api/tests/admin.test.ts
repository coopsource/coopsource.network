import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import type { TestApp } from './helpers/test-app.js';

describe('Admin', () => {
  let testApp: TestApp;
  let coopDid: string;
  let adminDid: string;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
    const result = await setupAndLogin(testApp);
    coopDid = result.coopDid;
    adminDid = result.adminDid;
  });

  // ─── Auth Requirements ───────────────────────────────────────────

  it('GET /admin/pds/status requires admin auth (401)', async () => {
    const unauthApp = createTestApp();
    await unauthApp.agent.get('/api/v1/admin/pds/status').expect(401);
  });

  it('GET /admin/activity requires admin auth (401)', async () => {
    const unauthApp = createTestApp();
    await unauthApp.agent.get('/api/v1/admin/activity').expect(401);
  });

  it('POST /admin/test-reset requires auth (401)', async () => {
    const unauthApp = createTestApp();
    await unauthApp.agent.post('/api/v1/admin/test-reset').expect(401);
  });

  // ─── Successful Admin Operations ──────────────────────────────────

  it('GET /admin/pds/status returns commit count', async () => {
    const res = await testApp.agent
      .get('/api/v1/admin/pds/status')
      .expect(200);

    expect(res.body.totalCommits).toBeDefined();
    expect(res.body.lastSeq).toBeDefined();
  });

  it('GET /admin/activity returns entries', async () => {
    const res = await testApp.agent
      .get('/api/v1/admin/activity')
      .expect(200);

    expect(res.body.items).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('POST /admin/test-reset truncates tables (200)', async () => {
    // Create some data first
    await testApp.agent
      .post('/api/v1/agreements')
      .send({ title: 'Test', agreementType: 'custom' })
      .expect(201);

    // Reset
    const res = await testApp.agent
      .post('/api/v1/admin/test-reset')
      .expect(200);

    expect(res.body.ok).toBe(true);
  });
});
