import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { FiscalPeriodTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import { CreateFiscalPeriodSchema } from '@coopsource/common';

function formatFiscalPeriod(row: Selectable<FiscalPeriodTable>) {
  return {
    id: row.id,
    uri: row.uri,
    cooperativeDid: row.cooperative_did,
    label: row.label,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

export function createFiscalPeriodRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/admin/fiscal-periods — list
  router.get(
    '/api/v1/admin/fiscal-periods',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);

      const page = await container.fiscalPeriodService.list(
        req.actor!.cooperativeDid,
        params,
      );

      res.json({
        fiscalPeriods: page.items.map(formatFiscalPeriod),
        cursor: page.cursor ?? null,
      });
    }),
  );

  // POST /api/v1/admin/fiscal-periods — create
  router.post(
    '/api/v1/admin/fiscal-periods',
    requireAuth,
    requirePermission('compliance.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateFiscalPeriodSchema.parse(req.body);

      const period = await container.fiscalPeriodService.create(
        req.actor!.cooperativeDid,
        data,
      );

      res.status(201).json(formatFiscalPeriod(period));
    }),
  );

  // POST /api/v1/admin/fiscal-periods/:id/close — close period
  router.post(
    '/api/v1/admin/fiscal-periods/:id/close',
    requireAuth,
    requirePermission('compliance.manage'),
    asyncHandler(async (req, res) => {
      const period = await container.fiscalPeriodService.close(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );

      res.json(formatFiscalPeriod(period));
    }),
  );

  return router;
}
