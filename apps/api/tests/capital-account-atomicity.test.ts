import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

/**
 * Audit C-06 — capital-account ledger and balance must stay consistent under
 * concurrency.
 *
 * Every assertion here is an invariant that holds for any interleaving of a
 * correct implementation, so these are not timing-sensitive when the code is
 * right. Against the pre-fix read-modify-write they reproduced 19/20 and 1/1
 * respectively; the loops exist so a single lucky clean run cannot pass.
 */

const FANOUT = 8;
const ATTEMPTS = 10;

async function accountFor(memberDid: string) {
  return getTestDb()
    .selectFrom('capital_account')
    .where('member_did', '=', memberDid)
    .selectAll()
    .executeTakeFirst();
}

async function ledgerSumFor(memberDid: string): Promise<number> {
  const rows = await getTestDb()
    .selectFrom('capital_account_transaction')
    .where('member_did', '=', memberDid)
    .select(['amount'])
    .execute();
  return rows.reduce((sum, row) => sum + Number(row.amount), 0);
}

async function contribute(testApp: TestApp, memberDid: string, amount: number) {
  return testApp.agent
    .post('/api/v1/financial/capital-accounts/contribute')
    .send({ memberDid, amount });
}

async function redeem(testApp: TestApp, memberDid: string, amount: number) {
  return testApp.agent
    .post('/api/v1/financial/capital-accounts/redeem')
    .send({ memberDid, amount });
}

describe('Capital account atomicity (C-06)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('accepts only one of many concurrent redemptions of the whole balance', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const member = `did:web:redeem${attempt}.test`;
      await contribute(testApp, member, 100).then((r) => expect(r.status).toBe(201));

      const results = await Promise.all(
        Array.from({ length: FANOUT }, () => redeem(testApp, member, 100)),
      );
      const accepted = results.filter((r) => r.status === 200).length;

      expect(accepted, `attempt ${attempt}: accepted redemptions`).toBe(1);
    }
  });

  it('never disburses more than the balance through the ledger', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const member = `did:web:ledger${attempt}.test`;
      await contribute(testApp, member, 100).then((r) => expect(r.status).toBe(201));

      await Promise.all(
        Array.from({ length: FANOUT }, () => redeem(testApp, member, 100)),
      );

      const account = await accountFor(member);
      const ledger = await ledgerSumFor(member);

      // The ledger is the record of what actually moved; the account row must
      // agree with it, and neither may go negative.
      expect(ledger, `attempt ${attempt}: ledger sum vs balance`).toBe(
        Number(account?.balance),
      );
      expect(Number(account?.balance)).toBeGreaterThanOrEqual(0);
      expect(Number(account?.total_redeemed)).toBe(100);
    }
  });

  it('does not lose a concurrent contribution', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const member = `did:web:contrib${attempt}.test`;

      const results = await Promise.all(
        Array.from({ length: FANOUT }, () => contribute(testApp, member, 100)),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);

      const account = await accountFor(member);
      const ledger = await ledgerSumFor(member);

      expect(ledger, `attempt ${attempt}: ledger sum`).toBe(100 * FANOUT);
      expect(Number(account?.balance), `attempt ${attempt}: balance`).toBe(
        100 * FANOUT,
      );
      expect(Number(account?.initial_contribution)).toBe(100 * FANOUT);
    }
  });

  it('refuses a negative balance at the database, not only in the service', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await contribute(testApp, adminDid, 100).then((r) => expect(r.status).toBe(201));
    const account = await accountFor(adminDid);

    // Backstop: any future write path that forgets the guard is refused by
    // PostgreSQL rather than silently overdrawing the account.
    await expect(
      getTestDb()
        .updateTable('capital_account')
        .set({ balance: -1 })
        .where('id', '=', account!.id)
        .execute(),
    ).rejects.toThrow(/capital_account_balance_nonnegative/);
  });

  it('writes no ledger row for a rejected redemption', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await contribute(testApp, adminDid, 100).then((r) => expect(r.status).toBe(201));

    const res = await redeem(testApp, adminDid, 250);
    expect(res.status).toBe(400);

    const rows = await getTestDb()
      .selectFrom('capital_account_transaction')
      .where('member_did', '=', adminDid)
      .where('transaction_type', '=', 'revolving_redemption')
      .selectAll()
      .execute();

    expect(rows).toHaveLength(0);
    expect(Number((await accountFor(adminDid))?.balance)).toBe(100);
  });
});
