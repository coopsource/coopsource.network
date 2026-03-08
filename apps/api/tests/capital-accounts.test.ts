import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Capital Accounts', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('records initial contribution (201)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/financial/capital-accounts/contribute')
      .send({ memberDid: adminDid, amount: 500, description: 'Initial buy-in' })
      .expect(201);

    expect(res.body.memberDid).toBe(adminDid);
    expect(res.body.initialContribution).toBe(500);
    expect(res.body.balance).toBe(500);
  });

  it('creates capital account on first contribution', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    // No account exists yet
    await testApp.agent
      .get(`/api/v1/financial/capital-accounts/member/${adminDid}`)
      .expect(404);

    // Contributing creates the account
    await testApp.agent
      .post('/api/v1/financial/capital-accounts/contribute')
      .send({ memberDid: adminDid, amount: 100 })
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/financial/capital-accounts/member/${adminDid}`)
      .expect(200);

    expect(res.body.balance).toBe(100);
  });

  it('lists capital accounts', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/financial/capital-accounts/contribute')
      .send({ memberDid: adminDid, amount: 250 })
      .expect(201);

    await testApp.agent
      .post('/api/v1/financial/capital-accounts/contribute')
      .send({ memberDid: 'did:web:member2.test', amount: 300 })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/financial/capital-accounts')
      .expect(200);

    expect(res.body.accounts).toHaveLength(2);
  });

  it('gets member capital account balance', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/financial/capital-accounts/contribute')
      .send({ memberDid: adminDid, amount: 1000 })
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/financial/capital-accounts/member/${adminDid}`)
      .expect(200);

    expect(res.body.initialContribution).toBe(1000);
    expect(res.body.totalPatronageAllocated).toBe(0);
    expect(res.body.totalRedeemed).toBe(0);
    expect(res.body.balance).toBe(1000);
  });

  it('allocates patronage to capital accounts', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    // Create fiscal period, close, run patronage, approve
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

    await testApp.agent
      .post('/api/v1/financial/patronage/records/approve')
      .send({ fiscalPeriodId: periodRes.body.id })
      .expect(200);

    // Allocate to capital accounts
    const res = await testApp.agent
      .post('/api/v1/financial/capital-accounts/allocate')
      .send({ fiscalPeriodId: periodRes.body.id })
      .expect(200);

    expect(res.body.allocated).toBe(1);

    // Check balance (retained amount = 80% of 5000 = 4000)
    const accountRes = await testApp.agent
      .get(`/api/v1/financial/capital-accounts/member/${adminDid}`)
      .expect(200);

    expect(accountRes.body.totalPatronageAllocated).toBe(4000);
    expect(accountRes.body.balance).toBe(4000);
  });

  it('redeems revolving fund allocation', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    // Set up a balance via contribution
    await testApp.agent
      .post('/api/v1/financial/capital-accounts/contribute')
      .send({ memberDid: adminDid, amount: 1000 })
      .expect(201);

    // Redeem
    const res = await testApp.agent
      .post('/api/v1/financial/capital-accounts/redeem')
      .send({ memberDid: adminDid, amount: 300, description: 'Revolving fund payout' })
      .expect(200);

    expect(res.body.balance).toBe(700);
    expect(res.body.totalRedeemed).toBe(300);
  });

  it('rejects redemption exceeding balance', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/financial/capital-accounts/contribute')
      .send({ memberDid: adminDid, amount: 100 })
      .expect(201);

    await testApp.agent
      .post('/api/v1/financial/capital-accounts/redeem')
      .send({ memberDid: adminDid, amount: 500 })
      .expect(400);
  });

  it('lists transaction history', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/financial/capital-accounts/contribute')
      .send({ memberDid: adminDid, amount: 500 })
      .expect(201);

    await testApp.agent
      .post('/api/v1/financial/capital-accounts/redeem')
      .send({ memberDid: adminDid, amount: 100 })
      .expect(200);

    const res = await testApp.agent
      .get(`/api/v1/financial/capital-accounts/member/${adminDid}/transactions`)
      .expect(200);

    expect(res.body.transactions).toHaveLength(2);
    // Ordered by created_at desc — redemption is most recent
    const types = res.body.transactions.map((t: { transactionType: string }) => t.transactionType);
    expect(types).toContain('revolving_redemption');
    expect(types).toContain('initial_contribution');
  });

  it('gets cooperative equity summary', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/financial/capital-accounts/contribute')
      .send({ memberDid: adminDid, amount: 1000 })
      .expect(201);

    await testApp.agent
      .post('/api/v1/financial/capital-accounts/contribute')
      .send({ memberDid: 'did:web:member2.test', amount: 500 })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/financial/capital-accounts/summary')
      .expect(200);

    expect(res.body.totalAccounts).toBe(2);
    expect(res.body.totalEquity).toBe(1500);
    expect(res.body.totalInitialContributions).toBe(1500);
  });

  it('handles sequential operations correctly', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    // 1. Initial contribution
    await testApp.agent
      .post('/api/v1/financial/capital-accounts/contribute')
      .send({ memberDid: adminDid, amount: 500 })
      .expect(201);

    // 2. Another contribution
    await testApp.agent
      .post('/api/v1/financial/capital-accounts/contribute')
      .send({ memberDid: adminDid, amount: 200 })
      .expect(201);

    // 3. Redeem some
    await testApp.agent
      .post('/api/v1/financial/capital-accounts/redeem')
      .send({ memberDid: adminDid, amount: 100 })
      .expect(200);

    const res = await testApp.agent
      .get(`/api/v1/financial/capital-accounts/member/${adminDid}`)
      .expect(200);

    expect(res.body.initialContribution).toBe(700);
    expect(res.body.totalRedeemed).toBe(100);
    expect(res.body.balance).toBe(600);
  });
});
