import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { CommerceNeedTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateCommerceNeedSchema,
  UpdateCommerceNeedSchema,
} from '@coopsource/common';

function formatNeed(row: Selectable<CommerceNeedTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    title: row.title,
    description: row.description,
    category: row.category,
    urgency: row.urgency,
    location: row.location,
    tags: row.tags,
    uri: row.uri,
    cid: row.cid,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    indexedAt: row.indexed_at instanceof Date ? row.indexed_at.toISOString() : row.indexed_at,
  };
}

export function createCommerceNeedRoutes(container: Container): Router {
  const router = Router();

  // Create need
  router.post(
    '/api/v1/commerce/needs',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateCommerceNeedSchema.parse(req.body);
      const need = await container.commerceNeedService.createNeed(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.status(201).json(formatNeed(need));
    }),
  );

  // Search needs (public)
  router.get(
    '/api/v1/commerce/needs/search',
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const filters = {
        category: req.query.category ? String(req.query.category) : undefined,
        urgency: req.query.urgency ? String(req.query.urgency) : undefined,
      };
      const page = await container.commerceNeedService.searchNeeds(params, filters);
      res.json({ needs: page.items.map(formatNeed), cursor: page.cursor ?? null });
    }),
  );

  // List own needs
  router.get(
    '/api/v1/commerce/needs',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const filters = {
        category: req.query.category ? String(req.query.category) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        urgency: req.query.urgency ? String(req.query.urgency) : undefined,
      };
      const page = await container.commerceNeedService.listNeeds(
        req.actor!.cooperativeDid,
        params,
        filters,
      );
      res.json({ needs: page.items.map(formatNeed), cursor: page.cursor ?? null });
    }),
  );

  // Get single need (public)
  router.get(
    '/api/v1/commerce/needs/:id',
    asyncHandler(async (req, res) => {
      const need = await container.commerceNeedService.getNeed(
        String(req.params.id),
      );
      res.json(formatNeed(need));
    }),
  );

  // Update need
  router.put(
    '/api/v1/commerce/needs/:id',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      const data = UpdateCommerceNeedSchema.parse(req.body);
      const need = await container.commerceNeedService.updateNeed(
        String(req.params.id),
        req.actor!.cooperativeDid,
        data,
      );
      res.json(formatNeed(need));
    }),
  );

  // Delete need (soft-delete → cancelled)
  router.delete(
    '/api/v1/commerce/needs/:id',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      await container.commerceNeedService.deleteNeed(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.status(204).end();
    }),
  );

  return router;
}
