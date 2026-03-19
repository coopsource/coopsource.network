import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { ScheduleShiftTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import { CreateShiftSchema, UpdateShiftSchema } from '@coopsource/common';

function formatShift(row: Selectable<ScheduleShiftTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    title: row.title,
    description: row.description,
    assignedDid: row.assigned_did,
    recurrence: row.recurrence,
    location: row.location,
    status: row.status,
    createdBy: row.created_by,
    startsAt: row.starts_at instanceof Date ? row.starts_at.toISOString() : row.starts_at,
    endsAt: row.ends_at instanceof Date ? row.ends_at.toISOString() : row.ends_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

export function createScheduleRoutes(container: Container): Router {
  const router = Router();

  router.post(
    '/api/v1/ops/shifts',
    requireAuth,
    requirePermission('ops.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateShiftSchema.parse(req.body);
      const shift = await container.scheduleService.createShift(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.status(201).json(formatShift(shift));
    }),
  );

  router.get(
    '/api/v1/ops/shifts/fairness',
    requireAuth,
    asyncHandler(async (req, res) => {
      const startDate = String(req.query.startDate ?? '');
      const endDate = String(req.query.endDate ?? '');
      if (!startDate || !endDate) {
        res.status(400).json({ error: 'VALIDATION', message: 'startDate and endDate are required' });
        return;
      }
      const summary = await container.scheduleService.getFairnessSummary(
        req.actor!.cooperativeDid,
        startDate,
        endDate,
      );
      res.json({ items: summary });
    }),
  );

  router.get(
    '/api/v1/ops/shifts',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const status = req.query.status ? String(req.query.status) : undefined;
      const assignedDid = req.query.assignedDid ? String(req.query.assignedDid) : undefined;
      const startAfter = req.query.startAfter ? String(req.query.startAfter) : undefined;
      const endBefore = req.query.endBefore ? String(req.query.endBefore) : undefined;
      const page = await container.scheduleService.listShifts(
        req.actor!.cooperativeDid,
        params,
        { status, assignedDid, startAfter, endBefore },
      );
      res.json({ items: page.items.map(formatShift), cursor: page.cursor ?? null });
    }),
  );

  router.get(
    '/api/v1/ops/shifts/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const shift = await container.scheduleService.getShift(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.json(formatShift(shift));
    }),
  );

  router.put(
    '/api/v1/ops/shifts/:id',
    requireAuth,
    requirePermission('ops.manage'),
    asyncHandler(async (req, res) => {
      const data = UpdateShiftSchema.parse(req.body);
      const shift = await container.scheduleService.updateShift(
        String(req.params.id),
        req.actor!.cooperativeDid,
        data,
      );
      res.json(formatShift(shift));
    }),
  );

  router.delete(
    '/api/v1/ops/shifts/:id',
    requireAuth,
    requirePermission('ops.manage'),
    asyncHandler(async (req, res) => {
      await container.scheduleService.deleteShift(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.status(204).end();
    }),
  );

  router.post(
    '/api/v1/ops/shifts/:id/claim',
    requireAuth,
    asyncHandler(async (req, res) => {
      const shift = await container.scheduleService.claimShift(
        String(req.params.id),
        req.actor!.cooperativeDid,
        req.actor!.did,
      );
      res.json(formatShift(shift));
    }),
  );

  router.post(
    '/api/v1/ops/shifts/:id/complete',
    requireAuth,
    requirePermission('ops.manage'),
    asyncHandler(async (req, res) => {
      const shift = await container.scheduleService.completeShift(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.json(formatShift(shift));
    }),
  );

  return router;
}
