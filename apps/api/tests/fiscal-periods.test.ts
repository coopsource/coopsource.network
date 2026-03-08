import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Fiscal Periods', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('creates a fiscal period (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/admin/fiscal-periods')
      .send({
        label: 'FY2026',
        startsAt: '2026-01-01T00:00:00.000Z',
        endsAt: '2026-12-31T23:59:59.999Z',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.label).toBe('FY2026');
    expect(res.body.status).toBe('open');
    expect(res.body.createdAt).toBeDefined();
  });

  it('lists fiscal periods', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/admin/fiscal-periods')
      .send({ label: 'FY2025', startsAt: '2025-01-01T00:00:00.000Z', endsAt: '2025-12-31T23:59:59.999Z' })
      .expect(201);

    await testApp.agent
      .post('/api/v1/admin/fiscal-periods')
      .send({ label: 'FY2026', startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-12-31T23:59:59.999Z' })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/admin/fiscal-periods')
      .expect(200);

    expect(res.body.fiscalPeriods).toHaveLength(2);
    // Ordered by starts_at desc
    expect(res.body.fiscalPeriods[0].label).toBe('FY2026');
  });

  it('closes a fiscal period', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const period = await testApp.agent
      .post('/api/v1/admin/fiscal-periods')
      .send({ label: 'FY2025', startsAt: '2025-01-01T00:00:00.000Z', endsAt: '2025-12-31T23:59:59.999Z' })
      .expect(201);

    const res = await testApp.agent
      .post(`/api/v1/admin/fiscal-periods/${period.body.id}/close`)
      .expect(200);

    expect(res.body.status).toBe('closed');
  });

  it('rejects closing an already-closed period', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const period = await testApp.agent
      .post('/api/v1/admin/fiscal-periods')
      .send({ label: 'FY2025', startsAt: '2025-01-01T00:00:00.000Z', endsAt: '2025-12-31T23:59:59.999Z' })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/admin/fiscal-periods/${period.body.id}/close`)
      .expect(200);

    await testApp.agent
      .post(`/api/v1/admin/fiscal-periods/${period.body.id}/close`)
      .expect(409);
  });

  it('validates required fields', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/admin/fiscal-periods')
      .send({ label: 'FY2026' })
      .expect(400);
  });
});
