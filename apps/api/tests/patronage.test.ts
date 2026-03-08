import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Patronage', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('creates a patronage config (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/financial/patronage/config')
      .send({ metricType: 'hours_worked', cashPayoutPct: 25 })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.metricType).toBe('hours_worked');
    expect(res.body.cashPayoutPct).toBe(25);
    expect(res.body.stakeholderClass).toBeNull();
  });

  it('lists patronage configs', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/financial/patronage/config')
      .send({ metricType: 'hours_worked' })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/financial/patronage/config')
      .expect(200);

    expect(res.body.configs).toHaveLength(1);
  });

  it('updates a patronage config', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/financial/patronage/config')
      .send({ metricType: 'hours_worked' })
      .expect(201);

    const res = await testApp.agent
      .put(`/api/v1/financial/patronage/config/${createRes.body.id}`)
      .send({ metricType: 'salary', cashPayoutPct: 30 })
      .expect(200);

    expect(res.body.metricType).toBe('salary');
    expect(res.body.cashPayoutPct).toBe(30);
  });

  it('deletes a patronage config', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/financial/patronage/config')
      .send({ metricType: 'hours_worked' })
      .expect(201);

    await testApp.agent
      .delete(`/api/v1/financial/patronage/config/${createRes.body.id}`)
      .expect(204);

    const listRes = await testApp.agent
      .get('/api/v1/financial/patronage/config')
      .expect(200);

    expect(listRes.body.configs).toHaveLength(0);
  });

  it('rejects cashPayoutPct below 20 (IRS minimum)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/financial/patronage/config')
      .send({ metricType: 'hours_worked', cashPayoutPct: 10 })
      .expect(400);
  });

  it('runs patronage calculation on closed fiscal period', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    // Create and close a fiscal period
    const periodRes = await testApp.agent
      .post('/api/v1/admin/fiscal-periods')
      .send({ label: 'FY2025', startsAt: '2025-01-01T00:00:00Z', endsAt: '2025-12-31T23:59:59Z' })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/admin/fiscal-periods/${periodRes.body.id}/close`)
      .expect(200);

    // Create patronage config
    await testApp.agent
      .post('/api/v1/financial/patronage/config')
      .send({ metricType: 'hours_worked', cashPayoutPct: 20 })
      .expect(201);

    // Run calculation
    const calcRes = await testApp.agent
      .post('/api/v1/financial/patronage/calculate')
      .send({
        fiscalPeriodId: periodRes.body.id,
        totalSurplus: 10000,
        metrics: [
          { memberDid: adminDid, metricValue: 60 },
          { memberDid: 'did:web:member2.test', metricValue: 40 },
        ],
      })
      .expect(201);

    expect(calcRes.body.records).toHaveLength(2);

    // Check first member (60% of 10000 = 6000)
    const adminRecord = calcRes.body.records.find((r: { memberDid: string }) => r.memberDid === adminDid);
    expect(adminRecord.totalAllocation).toBe(6000);
    expect(adminRecord.patronageRatio).toBeCloseTo(0.6);
    expect(adminRecord.cashAmount).toBe(1200); // 20% of 6000
    expect(adminRecord.retainedAmount).toBe(4800); // 80% of 6000
    expect(adminRecord.status).toBe('calculated');
  });

  it('calculates correct ratios', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const periodRes = await testApp.agent
      .post('/api/v1/admin/fiscal-periods')
      .send({ label: 'FY2025', startsAt: '2025-01-01T00:00:00Z', endsAt: '2025-12-31T23:59:59Z' })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/admin/fiscal-periods/${periodRes.body.id}/close`)
      .expect(200);

    const calcRes = await testApp.agent
      .post('/api/v1/financial/patronage/calculate')
      .send({
        fiscalPeriodId: periodRes.body.id,
        totalSurplus: 1000,
        metrics: [
          { memberDid: 'did:web:a.test', metricValue: 25 },
          { memberDid: 'did:web:b.test', metricValue: 25 },
          { memberDid: 'did:web:c.test', metricValue: 50 },
        ],
      })
      .expect(201);

    const recordC = calcRes.body.records.find((r: { memberDid: string }) => r.memberDid === 'did:web:c.test');
    expect(recordC.totalAllocation).toBe(500); // 50% of 1000
    expect(recordC.patronageRatio).toBeCloseTo(0.5);
  });

  it('rejects calculation on open fiscal period', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const periodRes = await testApp.agent
      .post('/api/v1/admin/fiscal-periods')
      .send({ label: 'FY2025', startsAt: '2025-01-01T00:00:00Z', endsAt: '2025-12-31T23:59:59Z' })
      .expect(201);

    // Don't close the period — try to calculate
    await testApp.agent
      .post('/api/v1/financial/patronage/calculate')
      .send({
        fiscalPeriodId: periodRes.body.id,
        totalSurplus: 1000,
        metrics: [{ memberDid: 'did:web:a.test', metricValue: 100 }],
      })
      .expect(400);
  });

  it('lists patronage records for a period', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

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
        totalSurplus: 5000,
        metrics: [{ memberDid: adminDid, metricValue: 100 }],
      })
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/financial/patronage/records?fiscalPeriodId=${periodRes.body.id}`)
      .expect(200);

    expect(res.body.records).toHaveLength(1);
    expect(res.body.records[0].totalAllocation).toBe(5000);
  });

  it('approves patronage records', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

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
        totalSurplus: 1000,
        metrics: [{ memberDid: adminDid, metricValue: 100 }],
      })
      .expect(201);

    const res = await testApp.agent
      .post('/api/v1/financial/patronage/records/approve')
      .send({ fiscalPeriodId: periodRes.body.id })
      .expect(200);

    expect(res.body.approved).toBe(1);
  });

  it('gets member patronage history', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

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
        totalSurplus: 2000,
        metrics: [{ memberDid: adminDid, metricValue: 100 }],
      })
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/financial/patronage/records/member/${adminDid}`)
      .expect(200);

    expect(res.body.records).toHaveLength(1);
  });

  it('enforces minimum 20% cash payout', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    // Create config with 20% (minimum)
    await testApp.agent
      .post('/api/v1/financial/patronage/config')
      .send({ metricType: 'hours_worked', cashPayoutPct: 20 })
      .expect(201);

    const periodRes = await testApp.agent
      .post('/api/v1/admin/fiscal-periods')
      .send({ label: 'FY2025', startsAt: '2025-01-01T00:00:00Z', endsAt: '2025-12-31T23:59:59Z' })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/admin/fiscal-periods/${periodRes.body.id}/close`)
      .expect(200);

    const calcRes = await testApp.agent
      .post('/api/v1/financial/patronage/calculate')
      .send({
        fiscalPeriodId: periodRes.body.id,
        totalSurplus: 1000,
        metrics: [{ memberDid: adminDid, metricValue: 100 }],
      })
      .expect(201);

    // Cash should be exactly 20% of allocation
    expect(calcRes.body.records[0].cashAmount).toBe(200);
    expect(calcRes.body.records[0].retainedAmount).toBe(800);
  });
});
