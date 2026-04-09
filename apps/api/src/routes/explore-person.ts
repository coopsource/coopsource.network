import { Router } from 'express';
import type { Container } from '../container.js';
import { asyncHandler } from '../lib/async-handler.js';

/**
 * V8.9 — Public person profile endpoint.
 *
 * GET /api/v1/explore/people/:handle
 *
 * Returns a person's public profile gated by the D1 hybrid discoverability
 * predicate (discoverable OR has alignment data). No authentication required.
 */
export function createExplorePersonRoutes(container: Container): Router {
  const router = Router();

  router.get(
    '/api/v1/explore/people/:handle',
    asyncHandler(async (req, res) => {
      const handle = String(req.params.handle);
      const result = await container.profileService.getPublicPersonProfile(handle);
      if (!result) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(result);
    }),
  );

  return router;
}
