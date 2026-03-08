import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { AdminOfficerTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import { CreateOfficerSchema } from '@coopsource/common';

function formatOfficer(row: Selectable<AdminOfficerTable>) {
  return {
    id: row.id,
    uri: row.uri,
    cooperativeDid: row.cooperative_did,
    officerDid: row.officer_did,
    title: row.title,
    appointedAt: row.appointed_at.toISOString(),
    termEndsAt: row.term_ends_at?.toISOString() ?? null,
    appointmentType: row.appointment_type,
    responsibilities: row.responsibilities,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

export function createOfficerRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/admin/officers — list
  router.get(
    '/api/v1/admin/officers',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const status = req.query.status ? String(req.query.status) : undefined;

      const page = await container.officerRecordService.list(
        req.actor!.cooperativeDid,
        { ...params, status },
      );

      res.json({
        officers: page.items.map(formatOfficer),
        cursor: page.cursor ?? null,
      });
    }),
  );

  // POST /api/v1/admin/officers — appoint
  router.post(
    '/api/v1/admin/officers',
    requireAuth,
    requirePermission('officer.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateOfficerSchema.parse(req.body);

      const officer = await container.officerRecordService.appoint(
        req.actor!.cooperativeDid,
        data,
      );

      res.status(201).json(formatOfficer(officer));
    }),
  );

  // POST /api/v1/admin/officers/:id/end-term — end term
  router.post(
    '/api/v1/admin/officers/:id/end-term',
    requireAuth,
    requirePermission('officer.manage'),
    asyncHandler(async (req, res) => {
      const officer = await container.officerRecordService.endTerm(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );

      res.json(formatOfficer(officer));
    }),
  );

  return router;
}
