import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import type {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from 'kysely';
import { ExpenseService } from '../src/services/expense-service.js';

/**
 * Audit N-3 — every expense state transition must be conditional on the status
 * it was validated against.
 *
 * Each service method read the row, checked its status, then issued an UPDATE
 * with no status predicate. A transition validated against `submitted` could
 * therefore land on a row that had since become `approved` or `reimbursed`.
 */

const FANOUT = 8;
const ATTEMPTS = 5;

/**
 * Holds the first SELECT a service issues open until the test releases it, so
 * the interleave that produces a stale write is deterministic rather than
 * raced. `transformResult` is Kysely's own async result hook, so the query
 * under test is the product's, unmodified.
 */
function createReadGate(): {
  plugin: KyselyPlugin;
  reachedRead: Promise<void>;
  releaseRead: () => void;
} {
  const selectQueries = new WeakSet<object>();
  let armed = true;
  let signalReached: () => void = () => {};
  const reachedRead = new Promise<void>((resolve) => {
    signalReached = resolve;
  });
  let releaseRead: () => void = () => {};
  const released = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });

  const plugin: KyselyPlugin = {
    transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
      if (args.node.kind === 'SelectQueryNode') selectQueries.add(args.queryId);
      return args.node;
    },
    async transformResult(
      args: PluginTransformResultArgs,
    ): Promise<QueryResult<UnknownRow>> {
      if (armed && selectQueries.has(args.queryId)) {
        armed = false;
        signalReached();
        await released;
      }
      return args.result;
    },
  };

  return { plugin, reachedRead, releaseRead: () => releaseRead() };
}

function gatedExpenseService(testApp: TestApp) {
  const gate = createReadGate();
  return {
    gate,
    service: new ExpenseService(getTestDb().withPlugin(gate.plugin), testApp.clock),
  };
}

async function submitExpense(
  testApp: TestApp,
  title: string,
  amount: number,
): Promise<string> {
  const res = await testApp.agent
    .post('/api/v1/finance/expenses')
    .send({ title, amount });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function expenseRow(id: string) {
  return getTestDb()
    .selectFrom('expense')
    .where('id', '=', id)
    .selectAll()
    .executeTakeFirst();
}

describe('Expense status compare-and-set (N-3)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('rejects an update to an already-approved expense with 409', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const id = await submitExpense(testApp, 'approved then edited', 10);
    await testApp.agent
      .post(`/api/v1/finance/expenses/${id}/review`)
      .send({ action: 'approve' })
      .expect(200);

    const res = await testApp.agent
      .put(`/api/v1/finance/expenses/${id}`)
      .send({ amount: 100000 });

    expect([400, 409]).toContain(res.status);
    expect(Number((await expenseRow(id))?.amount)).toBe(10);
  });

  it('accepts only one of many concurrent approvals', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const id = await submitExpense(testApp, `double review ${attempt}`, 25);

      const results = await Promise.all(
        Array.from({ length: FANOUT }, () =>
          testApp.agent
            .post(`/api/v1/finance/expenses/${id}/review`)
            .send({ action: 'approve' }),
        ),
      );

      const accepted = results.filter((r) => r.status === 200).length;
      expect(accepted, `attempt ${attempt}: accepted reviews`).toBe(1);
    }
  });

  it('a stale review cannot resurrect approved on a reimbursed expense', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);

    const id = await submitExpense(testApp, 'double reimbursement', 50);

    // Reviewer A reads the row while it is still `submitted`, and is held there.
    const { gate, service } = gatedExpenseService(testApp);
    const staleReview = service
      .reviewExpense(id, coopDid, adminDid, 'approve')
      .catch(() => undefined);
    await gate.reachedRead;

    // Reviewer B approves and a manager reimburses, both through real routes.
    await testApp.agent
      .post(`/api/v1/finance/expenses/${id}/review`)
      .send({ action: 'approve' })
      .expect(200);
    const first = await testApp.agent
      .post('/api/v1/finance/expenses/reimburse')
      .send({ expenseIds: [id] })
      .expect(200);
    expect(first.body.reimbursed).toBe(1);

    // Reviewer A's write lands now, against a row that is already reimbursed.
    gate.releaseRead();
    await staleReview;

    expect((await expenseRow(id))?.status).toBe('reimbursed');

    const second = await testApp.agent
      .post('/api/v1/finance/expenses/reimburse')
      .send({ expenseIds: [id] });
    expect(second.body.reimbursed ?? 0).toBe(0);
  });

  it('a stale update cannot change an expense approved after its read', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);

    const id = await submitExpense(testApp, 'stale edit', 10);

    const { gate, service } = gatedExpenseService(testApp);
    const staleUpdate = service
      .updateExpense(id, coopDid, adminDid, { amount: 100000 })
      .catch(() => undefined);
    await gate.reachedRead;

    await testApp.agent
      .post(`/api/v1/finance/expenses/${id}/review`)
      .send({ action: 'approve' })
      .expect(200);

    gate.releaseRead();
    await staleUpdate;

    const row = await expenseRow(id);
    expect(row?.status).toBe('approved');
    expect(Number(row?.amount)).toBe(10);
  });

  it('does not delete an expense approved after the draft check', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);
    const db = getTestDb();

    // `draft` is unreachable through the API today — createExpense hardcodes
    // `submitted` — so the row is seeded directly. deleteExpense is the third
    // verb with the same read-then-write shape as updateExpense and
    // reviewExpense, and its guard has to be conditional for the same reason.
    const id = await submitExpense(testApp, 'draft then approved', 15);
    await db
      .updateTable('expense')
      .set({ status: 'draft' })
      .where('id', '=', id)
      .execute();

    const { gate, service } = gatedExpenseService(testApp);
    const staleDelete = service
      .deleteExpense(id, coopDid, adminDid)
      .catch(() => undefined);
    await gate.reachedRead;

    await db
      .updateTable('expense')
      .set({ status: 'approved' })
      .where('id', '=', id)
      .execute();

    gate.releaseRead();
    await staleDelete;

    const row = await expenseRow(id);
    expect(row, 'an approved expense must survive a stale draft delete').toBeDefined();
    expect(row?.status).toBe('approved');
  });
});
