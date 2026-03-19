import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { ProcurementGroupTable, ProcurementDemandTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateProcurementGroupSchema,
  AddProcurementDemandSchema,
} from '@coopsource/common';

function formatGroup(row: Selectable<ProcurementGroupTable>) {
  return {
    id: row.id,
    networkDid: row.network_did,
    title: row.title,
    description: row.description,
    category: row.category,
    targetQuantity: row.target_quantity,
    deadline: row.deadline instanceof Date ? row.deadline.toISOString() : row.deadline,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function formatGroupWithDemand(
  row: Selectable<ProcurementGroupTable> & { totalQuantity: number; demandCount: number },
) {
  return {
    ...formatGroup(row),
    totalQuantity: row.totalQuantity,
    demandCount: row.demandCount,
  };
}

function formatDemand(row: Selectable<ProcurementDemandTable>) {
  return {
    id: row.id,
    groupId: row.group_id,
    cooperativeDid: row.cooperative_did,
    quantity: Number(row.quantity),
    notes: row.notes,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export function createProcurementRoutes(container: Container): Router {
  const router = Router();

  // Create procurement group
  router.post(
    '/api/v1/commerce/procurement',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateProcurementGroupSchema.parse(req.body);
      const group = await container.procurementService.createGroup(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.status(201).json(formatGroup(group));
    }),
  );

  // List procurement groups
  router.get(
    '/api/v1/commerce/procurement',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const filters = {
        status: req.query.status ? String(req.query.status) : undefined,
        category: req.query.category ? String(req.query.category) : undefined,
      };
      const page = await container.procurementService.listGroups(
        req.actor!.cooperativeDid,
        params,
        filters,
      );
      res.json({ groups: page.items.map(formatGroup), cursor: page.cursor ?? null });
    }),
  );

  // Get procurement group with demand summary
  router.get(
    '/api/v1/commerce/procurement/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const group = await container.procurementService.getGroup(
        String(req.params.id),
      );
      res.json(formatGroupWithDemand(group));
    }),
  );

  // Update procurement group
  router.put(
    '/api/v1/commerce/procurement/:id',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      const data = req.body as {
        title?: string;
        description?: string;
        category?: string;
        targetQuantity?: number;
        deadline?: string;
        status?: string;
      };
      const group = await container.procurementService.updateGroup(
        String(req.params.id),
        req.actor!.cooperativeDid,
        data,
      );
      res.json(formatGroup(group));
    }),
  );

  // Add demand to procurement group
  router.post(
    '/api/v1/commerce/procurement/:id/demand',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = AddProcurementDemandSchema.parse(req.body);
      const demand = await container.procurementService.addDemand(
        String(req.params.id),
        req.actor!.cooperativeDid,
        data,
      );
      res.status(201).json(formatDemand(demand));
    }),
  );

  // Remove demand from procurement group
  router.delete(
    '/api/v1/commerce/procurement/:id/demand',
    requireAuth,
    asyncHandler(async (req, res) => {
      await container.procurementService.removeDemand(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.status(204).end();
    }),
  );

  // List demands for a procurement group
  router.get(
    '/api/v1/commerce/procurement/:id/demands',
    requireAuth,
    asyncHandler(async (req, res) => {
      const demands = await container.procurementService.getDemands(
        String(req.params.id),
      );
      res.json({ demands: demands.map(formatDemand) });
    }),
  );

  return router;
}
