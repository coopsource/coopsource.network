import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { ComplianceItemTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import { CreateComplianceItemSchema, UpdateComplianceItemSchema } from '@coopsource/common';

function formatCompliance(row: Selectable<ComplianceItemTable>) {
  return {
    id: row.id,
    uri: row.uri,
    cooperativeDid: row.cooperative_did,
    title: row.title,
    description: row.description,
    dueDate: row.due_date.toISOString(),
    filingType: row.filing_type,
    status: row.status,
    completedAt: row.completed_at?.toISOString() ?? null,
    completedBy: row.completed_by,
    createdAt: row.created_at.toISOString(),
  };
}

export function createComplianceRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/admin/compliance — list
  router.get(
    '/api/v1/admin/compliance',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const status = req.query.status ? String(req.query.status) : undefined;

      const page = await container.complianceCalendarService.list(
        req.actor!.cooperativeDid,
        { ...params, status },
      );

      res.json({
        items: page.items.map(formatCompliance),
        cursor: page.cursor ?? null,
      });
    }),
  );

  // POST /api/v1/admin/compliance — create
  router.post(
    '/api/v1/admin/compliance',
    requireAuth,
    requirePermission('compliance.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateComplianceItemSchema.parse(req.body);

      const item = await container.complianceCalendarService.create(
        req.actor!.cooperativeDid,
        data,
      );

      res.status(201).json(formatCompliance(item));
    }),
  );

  // PUT /api/v1/admin/compliance/:id — update
  router.put(
    '/api/v1/admin/compliance/:id',
    requireAuth,
    requirePermission('compliance.manage'),
    asyncHandler(async (req, res) => {
      const data = UpdateComplianceItemSchema.parse(req.body);

      const item = await container.complianceCalendarService.update(
        String(req.params.id),
        req.actor!.cooperativeDid,
        data,
      );

      res.json(formatCompliance(item));
    }),
  );

  // POST /api/v1/admin/compliance/:id/complete — mark completed
  router.post(
    '/api/v1/admin/compliance/:id/complete',
    requireAuth,
    requirePermission('compliance.manage'),
    asyncHandler(async (req, res) => {
      const item = await container.complianceCalendarService.markCompleted(
        String(req.params.id),
        req.actor!.cooperativeDid,
        req.actor!.did,
      );

      res.json(formatCompliance(item));
    }),
  );

  return router;
}
