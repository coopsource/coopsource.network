import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Compliance Calendar', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('creates a compliance item (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/admin/compliance')
      .send({
        title: 'Annual Report 2026',
        description: 'File annual report with state',
        dueDate: '2026-04-15T00:00:00.000Z',
        filingType: 'annual_report',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Annual Report 2026');
    expect(res.body.filingType).toBe('annual_report');
    expect(res.body.status).toBe('pending');
    expect(res.body.completedAt).toBeNull();
  });

  it('lists compliance items', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/admin/compliance')
      .send({ title: 'Tax Filing', dueDate: '2026-04-15T00:00:00.000Z', filingType: 'tax_filing' })
      .expect(201);

    await testApp.agent
      .post('/api/v1/admin/compliance')
      .send({ title: 'State Report', dueDate: '2026-07-01T00:00:00.000Z', filingType: 'state_report' })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/admin/compliance')
      .expect(200);

    expect(res.body.items).toHaveLength(2);
    // Should be ordered by due date ascending
    expect(res.body.items[0].title).toBe('Tax Filing');
    expect(res.body.items[1].title).toBe('State Report');
  });

  it('marks a compliance item as completed', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const item = await testApp.agent
      .post('/api/v1/admin/compliance')
      .send({ title: 'Report', dueDate: '2026-04-15T00:00:00.000Z', filingType: 'annual_report' })
      .expect(201);

    const res = await testApp.agent
      .post(`/api/v1/admin/compliance/${item.body.id}/complete`)
      .expect(200);

    expect(res.body.status).toBe('completed');
    expect(res.body.completedAt).toBeDefined();
    expect(res.body.completedBy).toBeDefined();
  });

  it('rejects completing an already-completed item', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const item = await testApp.agent
      .post('/api/v1/admin/compliance')
      .send({ title: 'Report', dueDate: '2026-04-15T00:00:00.000Z', filingType: 'annual_report' })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/admin/compliance/${item.body.id}/complete`)
      .expect(200);

    await testApp.agent
      .post(`/api/v1/admin/compliance/${item.body.id}/complete`)
      .expect(409);
  });

  it('detects overdue items', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Create an item with a due date before MockClock's default (2026-01-01)
    await testApp.agent
      .post('/api/v1/admin/compliance')
      .send({ title: 'Overdue Report', dueDate: '2025-06-01T00:00:00.000Z', filingType: 'annual_report' })
      .expect(201);

    // getOverdue auto-updates pending items with past due dates
    const coopDid = (await testApp.container.db
      .selectFrom('entity')
      .where('type', '=', 'cooperative')
      .select('did')
      .executeTakeFirst())!.did;

    const overdue = await testApp.container.complianceCalendarService.getOverdue(coopDid);

    expect(overdue).toHaveLength(1);
    expect(overdue[0]!.status).toBe('overdue');
  });

  it('filters compliance items by status', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/admin/compliance')
      .send({ title: 'Pending', dueDate: '2027-01-01T00:00:00.000Z', filingType: 'annual_report' })
      .expect(201);

    const completed = await testApp.agent
      .post('/api/v1/admin/compliance')
      .send({ title: 'Done', dueDate: '2026-01-01T00:00:00.000Z', filingType: 'tax_filing' })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/admin/compliance/${completed.body.id}/complete`)
      .expect(200);

    const res = await testApp.agent
      .get('/api/v1/admin/compliance?status=completed')
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].status).toBe('completed');
  });
});
