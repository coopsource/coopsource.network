import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('1099-PATR Tax Forms', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  async function setupPatronage(testApp: ReturnType<typeof createTestApp>, adminDid: string, surplus: number) {
    const periodRes = await testApp.agent
      .post('/api/v1/admin/fiscal-periods')
      .send({ label: 'FY2025', startsAt: '2025-01-01T00:00:00Z', endsAt: '2025-12-31T23:59:59Z' })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/admin/fiscal-periods/${periodRes.body.id}/close`)
      .expect(200);

    await testApp.agent
      .post('/api/v1/financial/patronage/calculate')
      .send({
        fiscalPeriodId: periodRes.body.id,
        totalSurplus: surplus,
        metrics: [
          { memberDid: adminDid, metricValue: 60 },
          { memberDid: 'did:web:member2.test', metricValue: 40 },
        ],
      })
      .expect(201);

    await testApp.agent
      .post('/api/v1/financial/patronage/records/approve')
      .send({ fiscalPeriodId: periodRes.body.id })
      .expect(200);

    return periodRes.body.id;
  }

  it('generates 1099-PATR forms for a period (201)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);
    const periodId = await setupPatronage(testApp, adminDid, 1000);

    const res = await testApp.agent
      .post('/api/v1/financial/tax-forms/1099-patr/generate')
      .send({ fiscalPeriodId: periodId, taxYear: 2025 })
      .expect(201);

    expect(res.body.forms).toHaveLength(2);
    expect(res.body.forms[0].taxYear).toBe(2025);
    expect(res.body.forms[0].generationStatus).toBe('pending');
  });

  it('skips members with patronage < $10', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    // Total surplus of $15, member2 gets 40% = $6 (below $10 threshold)
    const periodId = await setupPatronage(testApp, adminDid, 15);

    const res = await testApp.agent
      .post('/api/v1/financial/tax-forms/1099-patr/generate')
      .send({ fiscalPeriodId: periodId, taxYear: 2025 })
      .expect(201);

    // Only adminDid should get a form (60% of 15 = 9... actually also < $10)
    // Let's check: 60% of 15 = 9, 40% of 15 = 6 — both below $10
    expect(res.body.forms).toHaveLength(0);
  });

  it('calculates correct cash deadline (end + 8.5 months)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);
    const periodId = await setupPatronage(testApp, adminDid, 1000);

    const res = await testApp.agent
      .post('/api/v1/financial/tax-forms/1099-patr/generate')
      .send({ fiscalPeriodId: periodId, taxYear: 2025 })
      .expect(201);

    // Fiscal period ends 2025-12-31, + 8.5 months = approximately 2026-09-15
    const deadline = new Date(res.body.forms[0].cashDeadline);
    expect(deadline.getFullYear()).toBe(2026);
    expect(deadline.getMonth()).toBe(8); // September (0-indexed)
  });

  it('lists forms with filters', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);
    const periodId = await setupPatronage(testApp, adminDid, 1000);

    await testApp.agent
      .post('/api/v1/financial/tax-forms/1099-patr/generate')
      .send({ fiscalPeriodId: periodId, taxYear: 2025 })
      .expect(201);

    // List all
    const allRes = await testApp.agent
      .get('/api/v1/financial/tax-forms/1099-patr')
      .expect(200);
    expect(allRes.body.forms).toHaveLength(2);

    // Filter by tax year
    const yearRes = await testApp.agent
      .get('/api/v1/financial/tax-forms/1099-patr?taxYear=2025')
      .expect(200);
    expect(yearRes.body.forms).toHaveLength(2);

    // Filter by non-existent year
    const emptyRes = await testApp.agent
      .get('/api/v1/financial/tax-forms/1099-patr?taxYear=2024')
      .expect(200);
    expect(emptyRes.body.forms).toHaveLength(0);
  });

  it('gets single form detail', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);
    const periodId = await setupPatronage(testApp, adminDid, 1000);

    const genRes = await testApp.agent
      .post('/api/v1/financial/tax-forms/1099-patr/generate')
      .send({ fiscalPeriodId: periodId, taxYear: 2025 })
      .expect(201);

    const formId = genRes.body.forms[0].id;

    const res = await testApp.agent
      .get(`/api/v1/financial/tax-forms/1099-patr/${formId}`)
      .expect(200);

    expect(res.body.id).toBe(formId);
    expect(res.body.patronageDividends).toBeGreaterThan(0);
  });

  it('marks form as generated then sent', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);
    const periodId = await setupPatronage(testApp, adminDid, 1000);

    const genRes = await testApp.agent
      .post('/api/v1/financial/tax-forms/1099-patr/generate')
      .send({ fiscalPeriodId: periodId, taxYear: 2025 })
      .expect(201);

    const formId = genRes.body.forms[0].id;

    // Mark generated
    const genStatusRes = await testApp.agent
      .post(`/api/v1/financial/tax-forms/1099-patr/${formId}/mark-generated`)
      .expect(200);

    expect(genStatusRes.body.generationStatus).toBe('generated');
    expect(genStatusRes.body.generatedAt).toBeDefined();

    // Mark sent
    const sentRes = await testApp.agent
      .post(`/api/v1/financial/tax-forms/1099-patr/${formId}/mark-sent`)
      .expect(200);

    expect(sentRes.body.generationStatus).toBe('sent');
    expect(sentRes.body.sentAt).toBeDefined();
  });

  it('records cash payment', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);
    const periodId = await setupPatronage(testApp, adminDid, 1000);

    const genRes = await testApp.agent
      .post('/api/v1/financial/tax-forms/1099-patr/generate')
      .send({ fiscalPeriodId: periodId, taxYear: 2025 })
      .expect(201);

    const formId = genRes.body.forms[0].id;

    const res = await testApp.agent
      .post(`/api/v1/financial/tax-forms/1099-patr/${formId}/record-payment`)
      .expect(200);

    expect(res.body.cashPaid).toBeGreaterThan(0);
    expect(res.body.cashPaidAt).toBeDefined();
  });

  it('lists upcoming deadlines', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    // MockClock starts at 2026-01-01. We need a fiscal period whose
    // cash deadline (end + 8.5 months) falls within 30 days of now.
    // Period end: 2025-04-15 → deadline: ~2025-12-30 → ~2 days before clock's now (2026-01-01)
    // That's within 30 days of now, so it should appear.
    const periodRes = await testApp.agent
      .post('/api/v1/admin/fiscal-periods')
      .send({
        label: 'FY-deadline',
        startsAt: '2025-01-01T00:00:00Z',
        endsAt: '2025-04-15T00:00:00Z',
      })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/admin/fiscal-periods/${periodRes.body.id}/close`)
      .expect(200);

    await testApp.agent
      .post('/api/v1/financial/patronage/calculate')
      .send({
        fiscalPeriodId: periodRes.body.id,
        totalSurplus: 1000,
        metrics: [{ memberDid: adminDid, metricValue: 100 }],
      })
      .expect(201);

    await testApp.agent
      .post('/api/v1/financial/patronage/records/approve')
      .send({ fiscalPeriodId: periodRes.body.id })
      .expect(200);

    await testApp.agent
      .post('/api/v1/financial/tax-forms/1099-patr/generate')
      .send({ fiscalPeriodId: periodRes.body.id, taxYear: 2025 })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/financial/tax-forms/1099-patr/deadlines')
      .expect(200);

    expect(res.body.forms.length).toBeGreaterThanOrEqual(1);
  });
});
