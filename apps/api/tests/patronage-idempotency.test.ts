import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

/**
 * Audit N-4 — a patronage calculation must be applied to a fiscal period once.
 *
 * The UNIQUE on (fiscal_period_id, member_did, stakeholder_class) used
 * PostgreSQL's default NULLS DISTINCT, and stakeholder_class is NULL on the
 * default path, so the constraint never fired. Three identical POSTs produced
 * three record sets and tripled every member's capital credit.
 */

async function closedPeriod(testApp: TestApp, label: string): Promise<string> {
  const res = await testApp.agent
    .post('/api/v1/admin/fiscal-periods')
    .send({
      label,
      startsAt: '2025-01-01T00:00:00Z',
      endsAt: '2025-12-31T23:59:59Z',
    });
  expect(res.status).toBe(201);
  await testApp.agent
    .post(`/api/v1/admin/fiscal-periods/${res.body.id}/close`)
    .expect(200);
  return res.body.id as string;
}

function calculate(testApp: TestApp, fiscalPeriodId: string, memberDid: string) {
  return testApp.agent.post('/api/v1/financial/patronage/calculate').send({
    fiscalPeriodId,
    totalSurplus: 100,
    metrics: [{ memberDid, metricValue: 10 }],
  });
}

async function recordCount(): Promise<number> {
  const rows = await getTestDb()
    .selectFrom('patronage_record')
    .select(['id'])
    .execute();
  return rows.length;
}

describe('Patronage calculation idempotency (N-4)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('rejects a repeated calculation instead of duplicating the allocation', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);
    const period = await closedPeriod(testApp, 'FY2025');

    expect((await calculate(testApp, period, adminDid)).status).toBe(201);
    expect((await calculate(testApp, period, adminDid)).status).toBe(409);
    expect((await calculate(testApp, period, adminDid)).status).toBe(409);

    expect(await recordCount()).toBe(1);

    await testApp.agent
      .post('/api/v1/financial/patronage/records/approve')
      .send({ fiscalPeriodId: period })
      .expect(200);
    await testApp.agent
      .post('/api/v1/financial/capital-accounts/allocate')
      .send({ fiscalPeriodId: period })
      .expect(200);

    const account = await getTestDb()
      .selectFrom('capital_account')
      .where('member_did', '=', adminDid)
      .selectAll()
      .executeTakeFirst();

    // $100 surplus, 20% cash payout, so 80 retained as capital credit.
    expect(Number(account?.balance)).toBe(80);
  });

  it('treats an uppercase fiscal period id as the same period', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);
    const period = await closedPeriod(testApp, 'FY2025');

    expect((await calculate(testApp, period, adminDid)).status).toBe(201);
    expect(
      (await calculate(testApp, period.toUpperCase(), adminDid)).status,
    ).toBe(409);

    expect(await recordCount()).toBe(1);
  });

  it('finds records when the period id is given in uppercase', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);
    const period = await closedPeriod(testApp, 'FY2025');
    expect((await calculate(testApp, period, adminDid)).status).toBe(201);

    const res = await testApp.agent
      .get(
        `/api/v1/financial/patronage/records?fiscalPeriodId=${period.toUpperCase()}`,
      )
      .expect(200);

    expect(res.body.records).toHaveLength(1);
  });

  it('answers a malformed fiscal period id with a client error, not a 500', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    const res = await calculate(testApp, 'not-a-uuid', adminDid);
    expect(res.status).toBe(400);
  });

  it('produces one record set from concurrent identical calculations', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);
    const period = await closedPeriod(testApp, 'FY2025');

    const results = await Promise.all(
      Array.from({ length: 6 }, () => calculate(testApp, period, adminDid)),
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await recordCount()).toBe(1);
  });

  it('refuses duplicate records at the database when the class is null', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);
    const period = await closedPeriod(testApp, 'FY2025');
    expect((await calculate(testApp, period, adminDid)).status).toBe(201);

    const seed = {
      cooperative_did: (await getTestDb()
        .selectFrom('patronage_record')
        .select('cooperative_did')
        .executeTakeFirstOrThrow()).cooperative_did,
      fiscal_period_id: period,
      member_did: adminDid,
      stakeholder_class: null,
      metric_value: 10,
      patronage_ratio: 1,
      total_allocation: 100,
      cash_amount: 20,
      retained_amount: 80,
      status: 'calculated',
    };

    // Backstop: `stakeholder_class` is null on the default path, so under
    // PostgreSQL's default NULLS DISTINCT the unique constraint never fired
    // and any writer bypassing the service guard could stack a second
    // allocation onto the period.
    await expect(
      getTestDb().insertInto('patronage_record').values(seed).execute(),
    ).rejects.toThrow(/uq_patronage_record_period_member/);
  });

  it('credits a member once for concurrent allocations of the same period', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);
    const period = await closedPeriod(testApp, 'FY2025');

    expect((await calculate(testApp, period, adminDid)).status).toBe(201);
    await testApp.agent
      .post('/api/v1/financial/patronage/records/approve')
      .send({ fiscalPeriodId: period })
      .expect(200);

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        testApp.agent
          .post('/api/v1/financial/capital-accounts/allocate')
          .send({ fiscalPeriodId: period }),
      ),
    );
    const totalAllocated = results.reduce(
      (sum, r) => sum + Number(r.body?.allocated ?? 0),
      0,
    );

    expect(totalAllocated).toBe(1);

    const account = await getTestDb()
      .selectFrom('capital_account')
      .where('member_did', '=', adminDid)
      .selectAll()
      .executeTakeFirst();
    expect(Number(account?.balance)).toBe(80);
  });
});
