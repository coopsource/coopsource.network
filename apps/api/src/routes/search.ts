import { Router } from 'express';
import type { Container } from '../container.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../auth/middleware.js';
import { parsePagination } from '../lib/pagination.js';

/**
 * V8.6 — Search routes.
 *
 * /api/v1/search/cooperatives is anon-safe (no requireAuth).
 * /api/v1/search/posts requires auth — and via requireAuth's active-membership
 * check, requires the viewer to be an active member of at least one coop.
 * Frontend at /me/explore handles the 401 path gracefully (see V8.6 plan §10).
 */
export function createSearchRoutes(container: Container): Router {
  const router = Router();

  router.get(
    '/api/v1/search/cooperatives',
    asyncHandler(async (req, res) => {
      const q = String(req.query.q ?? '').trim();
      const { limit, cursor } = parsePagination(req.query as Record<string, unknown>);
      const result = await container.searchService.searchCooperatives(q, {
        limit,
        cursor,
      });

      res.json({
        cooperatives: result.items.map((row) => ({
          did: row.did,
          handle: row.handle,
          displayName: row.displayName,
          description: row.description,
          cooperativeType: row.cooperativeType,
          memberCount: row.memberCount,
          website: row.website,
        })),
        cursor: result.cursor,
      });
    }),
  );

  router.get(
    '/api/v1/search/posts',
    requireAuth,
    asyncHandler(async (req, res) => {
      const viewerDid = req.actor!.did;
      const q = String(req.query.q ?? '').trim();
      const { limit, cursor } = parsePagination(req.query as Record<string, unknown>);
      const result = await container.searchService.searchPosts(q, viewerDid, {
        limit,
        cursor,
      });

      res.json({
        posts: result.items.map((row) => ({
          id: row.id,
          threadId: row.threadId,
          cooperativeDid: row.cooperativeDid,
          cooperativeHandle: row.cooperativeHandle,
          cooperativeDisplayName: row.cooperativeDisplayName,
          threadTitle: row.threadTitle,
          body: row.body,
          authorDid: row.authorDid,
          createdAt: row.createdAt.toISOString(),
        })),
        cursor: result.cursor,
      });
    }),
  );

  return router;
}
