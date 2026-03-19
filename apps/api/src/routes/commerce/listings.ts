import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { CommerceListingTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateCommerceListingSchema,
  UpdateCommerceListingSchema,
} from '@coopsource/common';

function formatListing(row: Selectable<CommerceListingTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    title: row.title,
    description: row.description,
    category: row.category,
    availability: row.availability,
    location: row.location,
    cooperativeType: row.cooperative_type,
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

export function createCommerceListingRoutes(container: Container): Router {
  const router = Router();

  // Create listing
  router.post(
    '/api/v1/commerce/listings',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateCommerceListingSchema.parse(req.body);
      const listing = await container.commerceListingService.createListing(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.status(201).json(formatListing(listing));
    }),
  );

  // Search listings (public)
  router.get(
    '/api/v1/commerce/listings/search',
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const filters = {
        category: req.query.category ? String(req.query.category) : undefined,
        location: req.query.location ? String(req.query.location) : undefined,
        tags: req.query.tags ? String(req.query.tags).split(',') : undefined,
        query: req.query.q ? String(req.query.q) : undefined,
      };
      const page = await container.commerceListingService.searchListings(params, filters);
      res.json({ listings: page.items.map(formatListing), cursor: page.cursor ?? null });
    }),
  );

  // List own listings
  router.get(
    '/api/v1/commerce/listings',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const filters = {
        category: req.query.category ? String(req.query.category) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
      };
      const page = await container.commerceListingService.listListings(
        req.actor!.cooperativeDid,
        params,
        filters,
      );
      res.json({ listings: page.items.map(formatListing), cursor: page.cursor ?? null });
    }),
  );

  // Get single listing (public)
  router.get(
    '/api/v1/commerce/listings/:id',
    asyncHandler(async (req, res) => {
      const listing = await container.commerceListingService.getListing(
        String(req.params.id),
      );
      res.json(formatListing(listing));
    }),
  );

  // Update listing
  router.put(
    '/api/v1/commerce/listings/:id',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      const data = UpdateCommerceListingSchema.parse(req.body);
      const listing = await container.commerceListingService.updateListing(
        String(req.params.id),
        req.actor!.cooperativeDid,
        data,
      );
      res.json(formatListing(listing));
    }),
  );

  // Delete listing (soft-delete → archived)
  router.delete(
    '/api/v1/commerce/listings/:id',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      await container.commerceListingService.deleteListing(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.status(204).end();
    }),
  );

  return router;
}
