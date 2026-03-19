import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { ExpenseTable, ExpenseCategoryTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateExpenseCategorySchema,
  CreateExpenseSchema,
  UpdateExpenseSchema,
  ReviewExpenseSchema,
  ReimburseExpenseSchema,
} from '@coopsource/common';

function formatExpense(row: Selectable<ExpenseTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    memberDid: row.member_did,
    categoryId: row.category_id,
    title: row.title,
    description: row.description,
    amount: Number(row.amount),
    currency: row.currency,
    receiptBlobCid: row.receipt_blob_cid,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : row.reviewed_at,
    reimbursedAt: row.reimbursed_at instanceof Date ? row.reimbursed_at.toISOString() : row.reimbursed_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function formatCategory(row: Selectable<ExpenseCategoryTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    name: row.name,
    description: row.description,
    budgetLimit: row.budget_limit !== null ? Number(row.budget_limit) : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export function createExpenseRoutes(container: Container): Router {
  const router = Router();

  // --- Expense Categories ---

  router.post(
    '/api/v1/finance/expense-categories',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateExpenseCategorySchema.parse(req.body);
      const category = await container.expenseService.createCategory(
        req.actor!.cooperativeDid,
        data,
      );
      res.status(201).json(formatCategory(category));
    }),
  );

  router.get(
    '/api/v1/finance/expense-categories',
    requireAuth,
    asyncHandler(async (req, res) => {
      const categories = await container.expenseService.listCategories(
        req.actor!.cooperativeDid,
      );
      res.json({ categories: categories.map(formatCategory) });
    }),
  );

  router.delete(
    '/api/v1/finance/expense-categories/:id',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      await container.expenseService.deleteCategory(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.status(204).end();
    }),
  );

  // --- Expenses ---

  router.post(
    '/api/v1/finance/expenses',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = CreateExpenseSchema.parse(req.body);
      const expense = await container.expenseService.createExpense(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.status(201).json(formatExpense(expense));
    }),
  );

  router.get(
    '/api/v1/finance/expenses/summary/categories',
    requireAuth,
    asyncHandler(async (req, res) => {
      const startDate = String(req.query.startDate ?? '');
      const endDate = String(req.query.endDate ?? '');
      if (!startDate || !endDate) {
        res.status(400).json({ error: 'VALIDATION', message: 'startDate and endDate are required' });
        return;
      }
      const summary = await container.expenseService.getCategorySummary(
        req.actor!.cooperativeDid,
        startDate,
        endDate,
      );
      res.json({ items: summary });
    }),
  );

  router.get(
    '/api/v1/finance/expenses/summary/member/:memberDid',
    requireAuth,
    asyncHandler(async (req, res) => {
      const startDate = String(req.query.startDate ?? '');
      const endDate = String(req.query.endDate ?? '');
      if (!startDate || !endDate) {
        res.status(400).json({ error: 'VALIDATION', message: 'startDate and endDate are required' });
        return;
      }
      const summary = await container.expenseService.getMemberExpenseSummary(
        req.actor!.cooperativeDid,
        String(req.params.memberDid),
        startDate,
        endDate,
      );
      res.json(summary);
    }),
  );

  router.get(
    '/api/v1/finance/expenses/reimburse',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const data = ReimburseExpenseSchema.parse(req.body);
      const count = await container.expenseService.reimburseExpenses(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data.expenseIds,
      );
      res.json({ reimbursed: count });
    }),
  );

  router.get(
    '/api/v1/finance/expenses',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const memberDid = req.query.memberDid ? String(req.query.memberDid) : undefined;
      const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const page = await container.expenseService.listExpenses(
        req.actor!.cooperativeDid,
        params,
        { memberDid, categoryId, status },
      );
      res.json({ items: page.items.map(formatExpense), cursor: page.cursor ?? null });
    }),
  );

  router.get(
    '/api/v1/finance/expenses/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const expense = await container.expenseService.getExpense(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.json(formatExpense(expense));
    }),
  );

  router.put(
    '/api/v1/finance/expenses/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = UpdateExpenseSchema.parse(req.body);
      const expense = await container.expenseService.updateExpense(
        String(req.params.id),
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.json(formatExpense(expense));
    }),
  );

  router.delete(
    '/api/v1/finance/expenses/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      await container.expenseService.deleteExpense(
        String(req.params.id),
        req.actor!.cooperativeDid,
        req.actor!.did,
      );
      res.status(204).end();
    }),
  );

  router.post(
    '/api/v1/finance/expenses/:id/review',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const data = ReviewExpenseSchema.parse(req.body);
      const expense = await container.expenseService.reviewExpense(
        String(req.params.id),
        req.actor!.cooperativeDid,
        req.actor!.did,
        data.action,
        data.note,
      );
      res.json(formatExpense(expense));
    }),
  );

  router.post(
    '/api/v1/finance/expenses/reimburse',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const data = ReimburseExpenseSchema.parse(req.body);
      const count = await container.expenseService.reimburseExpenses(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data.expenseIds,
      );
      res.json({ reimbursed: count });
    }),
  );

  return router;
}
