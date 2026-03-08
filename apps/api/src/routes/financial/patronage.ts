import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { PatronageConfigTable, PatronageRecordTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreatePatronageConfigSchema,
  UpdatePatronageConfigSchema,
  RunPatronageCalculationSchema,
} from '@coopsource/common';

function formatConfig(row: Selectable<PatronageConfigTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    stakeholderClass: row.stakeholder_class,
    metricType: row.metric_type,
    metricWeights: row.metric_weights,
    cashPayoutPct: row.cash_payout_pct,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function formatRecord(row: Selectable<PatronageRecordTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    fiscalPeriodId: row.fiscal_period_id,
    memberDid: row.member_did,
    stakeholderClass: row.stakeholder_class,
    metricValue: Number(row.metric_value),
    patronageRatio: Number(row.patronage_ratio),
    totalAllocation: Number(row.total_allocation),
    cashAmount: Number(row.cash_amount),
    retainedAmount: Number(row.retained_amount),
    status: row.status,
    approvedAt: row.approved_at instanceof Date ? row.approved_at.toISOString() : row.approved_at,
    distributedAt: row.distributed_at instanceof Date ? row.distributed_at.toISOString() : row.distributed_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export function createPatronageRoutes(container: Container): Router {
  const router = Router();

  router.post(
    '/api/v1/financial/patronage/config',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const data = CreatePatronageConfigSchema.parse(req.body);
      const config = await container.patronageService.createConfig(
        req.actor!.cooperativeDid,
        data,
      );
      res.status(201).json(formatConfig(config));
    }),
  );

  router.get(
    '/api/v1/financial/patronage/config',
    requireAuth,
    asyncHandler(async (req, res) => {
      const configs = await container.patronageService.listConfigs(
        req.actor!.cooperativeDid,
      );
      res.json({ configs: configs.map(formatConfig) });
    }),
  );

  router.put(
    '/api/v1/financial/patronage/config/:id',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const data = UpdatePatronageConfigSchema.parse(req.body);
      const config = await container.patronageService.updateConfig(
        String(req.params.id),
        req.actor!.cooperativeDid,
        data,
      );
      res.json(formatConfig(config));
    }),
  );

  router.delete(
    '/api/v1/financial/patronage/config/:id',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      await container.patronageService.deleteConfig(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.status(204).end();
    }),
  );

  router.post(
    '/api/v1/financial/patronage/calculate',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const data = RunPatronageCalculationSchema.parse(req.body);
      const records = await container.patronageService.runCalculation(
        req.actor!.cooperativeDid,
        data,
      );
      res.status(201).json({ records: records.map(formatRecord) });
    }),
  );

  router.get(
    '/api/v1/financial/patronage/records',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const fiscalPeriodId = String(req.query.fiscalPeriodId ?? '');
      if (!fiscalPeriodId) {
        res.status(400).json({ error: 'VALIDATION', message: 'fiscalPeriodId is required' });
        return;
      }
      const page = await container.patronageService.listRecords(
        req.actor!.cooperativeDid,
        fiscalPeriodId,
        params,
      );
      res.json({ records: page.items.map(formatRecord), cursor: page.cursor ?? null });
    }),
  );

  router.post(
    '/api/v1/financial/patronage/records/approve',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const { fiscalPeriodId } = req.body as { fiscalPeriodId: string };
      if (!fiscalPeriodId) {
        res.status(400).json({ error: 'VALIDATION', message: 'fiscalPeriodId is required' });
        return;
      }
      const count = await container.patronageService.approveRecords(
        req.actor!.cooperativeDid,
        fiscalPeriodId,
      );
      res.json({ approved: count });
    }),
  );

  router.get(
    '/api/v1/financial/patronage/records/member/:memberDid',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const page = await container.patronageService.getRecordsByMember(
        req.actor!.cooperativeDid,
        String(req.params.memberDid),
        params,
      );
      res.json({ records: page.items.map(formatRecord), cursor: page.cursor ?? null });
    }),
  );

  return router;
}
