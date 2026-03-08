import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { CapitalAccountTable, CapitalAccountTransactionTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import { RecordContributionSchema, RedeemAllocationSchema } from '@coopsource/common';

function formatAccount(row: Selectable<CapitalAccountTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    memberDid: row.member_did,
    initialContribution: Number(row.initial_contribution),
    totalPatronageAllocated: Number(row.total_patronage_allocated),
    totalRedeemed: Number(row.total_redeemed),
    balance: Number(row.balance),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function formatTransaction(row: Selectable<CapitalAccountTransactionTable>) {
  return {
    id: row.id,
    capitalAccountId: row.capital_account_id,
    cooperativeDid: row.cooperative_did,
    memberDid: row.member_did,
    transactionType: row.transaction_type,
    amount: Number(row.amount),
    fiscalPeriodId: row.fiscal_period_id,
    patronageRecordId: row.patronage_record_id,
    description: row.description,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    createdBy: row.created_by,
  };
}

export function createCapitalAccountRoutes(container: Container): Router {
  const router = Router();

  router.post(
    '/api/v1/financial/capital-accounts/contribute',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const data = RecordContributionSchema.parse(req.body);
      const account = await container.capitalAccountService.recordContribution(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.status(201).json(formatAccount(account));
    }),
  );

  router.post(
    '/api/v1/financial/capital-accounts/allocate',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const { fiscalPeriodId } = req.body as { fiscalPeriodId: string };
      if (!fiscalPeriodId) {
        res.status(400).json({ error: 'VALIDATION', message: 'fiscalPeriodId is required' });
        return;
      }
      const count = await container.capitalAccountService.allocatePatronageBulk(
        req.actor!.cooperativeDid,
        req.actor!.did,
        fiscalPeriodId,
      );
      res.json({ allocated: count });
    }),
  );

  router.post(
    '/api/v1/financial/capital-accounts/redeem',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const data = RedeemAllocationSchema.parse(req.body);
      const account = await container.capitalAccountService.redeemAllocation(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.json(formatAccount(account));
    }),
  );

  router.get(
    '/api/v1/financial/capital-accounts',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const page = await container.capitalAccountService.listAccounts(
        req.actor!.cooperativeDid,
        params,
      );
      res.json({ accounts: page.items.map(formatAccount), cursor: page.cursor ?? null });
    }),
  );

  router.get(
    '/api/v1/financial/capital-accounts/summary',
    requireAuth,
    asyncHandler(async (req, res) => {
      const summary = await container.capitalAccountService.getCooperativeSummary(
        req.actor!.cooperativeDid,
      );
      res.json(summary);
    }),
  );

  router.get(
    '/api/v1/financial/capital-accounts/member/:memberDid',
    requireAuth,
    asyncHandler(async (req, res) => {
      const account = await container.capitalAccountService.getAccount(
        req.actor!.cooperativeDid,
        String(req.params.memberDid),
      );
      res.json(formatAccount(account));
    }),
  );

  router.get(
    '/api/v1/financial/capital-accounts/member/:memberDid/transactions',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const page = await container.capitalAccountService.listTransactions(
        req.actor!.cooperativeDid,
        String(req.params.memberDid),
        params,
      );
      res.json({ transactions: page.items.map(formatTransaction), cursor: page.cursor ?? null });
    }),
  );

  return router;
}
