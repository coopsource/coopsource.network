import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { SharedResourceTable, ResourceBookingTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateSharedResourceSchema,
  UpdateSharedResourceSchema,
  CreateResourceBookingSchema,
  ReviewBookingSchema,
} from '@coopsource/common';

function formatResource(row: Selectable<SharedResourceTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    title: row.title,
    description: row.description,
    resourceType: row.resource_type,
    availabilitySchedule: row.availability_schedule,
    location: row.location,
    costPerUnit: row.cost_per_unit != null ? Number(row.cost_per_unit) : null,
    costUnit: row.cost_unit,
    uri: row.uri,
    cid: row.cid,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function formatBooking(row: Selectable<ResourceBookingTable>) {
  return {
    id: row.id,
    resourceId: row.resource_id,
    requestingDid: row.requesting_did,
    startsAt: row.starts_at instanceof Date ? row.starts_at.toISOString() : row.starts_at,
    endsAt: row.ends_at instanceof Date ? row.ends_at.toISOString() : row.ends_at,
    purpose: row.purpose,
    status: row.status,
    costTotal: row.cost_total != null ? Number(row.cost_total) : null,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at instanceof Date ? row.approved_at.toISOString() : row.approved_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    indexedAt: row.indexed_at instanceof Date ? row.indexed_at.toISOString() : row.indexed_at,
  };
}

export function createSharedResourceRoutes(container: Container): Router {
  const router = Router();

  // Create resource
  router.post(
    '/api/v1/commerce/resources',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateSharedResourceSchema.parse(req.body);
      const resource = await container.sharedResourceService.createResource(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.status(201).json(formatResource(resource));
    }),
  );

  // Search resources (public)
  router.get(
    '/api/v1/commerce/resources/search',
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const filters = {
        resourceType: req.query.resourceType ? String(req.query.resourceType) : undefined,
        location: req.query.location ? String(req.query.location) : undefined,
      };
      const page = await container.sharedResourceService.searchResources(params, filters);
      res.json({ resources: page.items.map(formatResource), cursor: page.cursor ?? null });
    }),
  );

  // List own resources
  router.get(
    '/api/v1/commerce/resources',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const filters = {
        resourceType: req.query.resourceType ? String(req.query.resourceType) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
      };
      const page = await container.sharedResourceService.listResources(
        req.actor!.cooperativeDid,
        params,
        filters,
      );
      res.json({ resources: page.items.map(formatResource), cursor: page.cursor ?? null });
    }),
  );

  // Get resource
  router.get(
    '/api/v1/commerce/resources/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const resource = await container.sharedResourceService.getResource(
        String(req.params.id),
      );
      res.json(formatResource(resource));
    }),
  );

  // Update resource
  router.put(
    '/api/v1/commerce/resources/:id',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      const data = UpdateSharedResourceSchema.parse(req.body);
      const resource = await container.sharedResourceService.updateResource(
        String(req.params.id),
        req.actor!.cooperativeDid,
        data,
      );
      res.json(formatResource(resource));
    }),
  );

  // Delete resource (soft-delete → unavailable)
  router.delete(
    '/api/v1/commerce/resources/:id',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      await container.sharedResourceService.deleteResource(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.status(204).end();
    }),
  );

  // Create booking
  router.post(
    '/api/v1/commerce/resources/:resourceId/bookings',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = CreateResourceBookingSchema.parse(req.body);
      const booking = await container.sharedResourceService.createBooking(
        String(req.params.resourceId),
        req.actor!.did,
        {
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          purpose: data.purpose,
        },
      );
      res.status(201).json(formatBooking(booking));
    }),
  );

  // Review booking (approve/reject)
  router.post(
    '/api/v1/commerce/bookings/:id/review',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      const { action } = ReviewBookingSchema.parse(req.body);
      const booking = await container.sharedResourceService.reviewBooking(
        String(req.params.id),
        req.actor!.cooperativeDid,
        req.actor!.did,
        action,
      );
      res.json(formatBooking(booking));
    }),
  );

  // List bookings
  router.get(
    '/api/v1/commerce/bookings',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const resourceId = req.query.resourceId ? String(req.query.resourceId) : undefined;
      const page = await container.sharedResourceService.listBookings(
        resourceId,
        req.actor!.did,
        params,
      );
      res.json({ bookings: page.items.map(formatBooking), cursor: page.cursor ?? null });
    }),
  );

  return router;
}
