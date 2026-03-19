import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { RevenueEntryTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import { CreateRevenueEntrySchema, UpdateRevenueEntrySchema } from '@coopsource/common';

function formatRevenueEntry(row: Selectable<RevenueEntryTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    amount: Number(row.amount),
    currency: row.currency,
    source: row.source,
    sourceReference: row.source_reference,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at instanceof Date ? row.recorded_at.toISOString() : row.recorded_at,
    periodStart: row.period_start instanceof Date ? row.period_start.toISOString() : row.period_start,
    periodEnd: row.period_end instanceof Date ? row.period_end.toISOString() : row.period_end,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export function createRevenueRoutes(container: Container): Router {
  const router = Router();

  router.post(
    '/api/v1/finance/revenue',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateRevenueEntrySchema.parse(req.body);
      const entry = await container.revenueService.createEntry(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.status(201).json(formatRevenueEntry(entry));
    }),
  );

  router.get(
    '/api/v1/finance/revenue/summary/project/:projectId',
    requireAuth,
    asyncHandler(async (req, res) => {
      const startDate = String(req.query.startDate ?? '');
      const endDate = String(req.query.endDate ?? '');
      if (!startDate || !endDate) {
        res.status(400).json({ error: 'VALIDATION', message: 'startDate and endDate are required' });
        return;
      }
      const summary = await container.revenueService.getProjectRevenueSummary(
        req.actor!.cooperativeDid,
        String(req.params.projectId),
        startDate,
        endDate,
      );
      res.json(summary);
    }),
  );

  router.get(
    '/api/v1/finance/revenue/summary',
    requireAuth,
    asyncHandler(async (req, res) => {
      const startDate = String(req.query.startDate ?? '');
      const endDate = String(req.query.endDate ?? '');
      if (!startDate || !endDate) {
        res.status(400).json({ error: 'VALIDATION', message: 'startDate and endDate are required' });
        return;
      }
      const summary = await container.revenueService.getOverallRevenueSummary(
        req.actor!.cooperativeDid,
        startDate,
        endDate,
      );
      res.json({ items: summary });
    }),
  );

  router.get(
    '/api/v1/finance/revenue',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
      const source = req.query.source ? String(req.query.source) : undefined;
      const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
      const endDate = req.query.endDate ? String(req.query.endDate) : undefined;
      const page = await container.revenueService.listEntries(
        req.actor!.cooperativeDid,
        params,
        { projectId, source, startDate, endDate },
      );
      res.json({ items: page.items.map(formatRevenueEntry), cursor: page.cursor ?? null });
    }),
  );

  router.get(
    '/api/v1/finance/revenue/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const entry = await container.revenueService.getEntry(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.json(formatRevenueEntry(entry));
    }),
  );

  router.put(
    '/api/v1/finance/revenue/:id',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const data = UpdateRevenueEntrySchema.parse(req.body);
      const entry = await container.revenueService.updateEntry(
        String(req.params.id),
        req.actor!.cooperativeDid,
        data,
      );
      res.json(formatRevenueEntry(entry));
    }),
  );

  router.delete(
    '/api/v1/finance/revenue/:id',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      await container.revenueService.deleteEntry(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.status(204).end();
    }),
  );

  return router;
}
