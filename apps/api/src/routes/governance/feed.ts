import { Router } from 'express';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { parsePagination } from '../../lib/pagination.js';

export function createGovernanceFeedRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/governance/feed/action-items — Action items for current user
  router.get(
    '/api/v1/governance/feed/action-items',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const result = await container.governanceFeedService.getActionItems(
        req.actor!.cooperativeDid,
        req.actor!.did,
        params,
      );
      res.json(result);
    }),
  );

  // GET /api/v1/governance/feed/outcomes — Recent outcomes
  router.get(
    '/api/v1/governance/feed/outcomes',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const result = await container.governanceFeedService.getRecentOutcomes(
        req.actor!.cooperativeDid,
        params,
      );
      res.json(result);
    }),
  );

  // GET /api/v1/governance/feed/meetings — Upcoming meetings
  router.get(
    '/api/v1/governance/feed/meetings',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const result = await container.governanceFeedService.getUpcomingMeetings(
        req.actor!.cooperativeDid,
        params,
      );
      res.json(result);
    }),
  );

  return router;
}
