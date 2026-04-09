import { Router } from 'express';
import { NotFoundError } from '@coopsource/common';
import type { Container } from '../container.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../auth/middleware.js';

/**
 * V8.7 — Match suggestion routes.
 *
 * All three endpoints require an active membership (via `requireAuth`).
 * The web `/me` page handles the 401 path gracefully so newly registered
 * users without a coop see a clean Home with the matches widget hidden.
 *
 * Ownership: every query filters by `user_did = req.actor.did` in the
 * SQL clause itself. A row that exists but belongs to another user is
 * indistinguishable from missing → 404. Never SELECT by `id` alone.
 *
 * Idempotency: dismiss and act each set their own column. Re-dismiss is
 * a no-op (clobbers `dismissed_at` to a fresher timestamp). Neither
 * operation 409s; both are treated as idempotent UPDATEs.
 */

// 8-4-4-4-12 hex with hyphens. Matches Postgres-generated UUIDs.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createMeMatchesRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/me/matches
  router.get(
    '/api/v1/me/matches',
    requireAuth,
    asyncHandler(async (req, res) => {
      const limitParam = Number(req.query.limit ?? 20);
      const limit = Number.isFinite(limitParam)
        ? Math.min(Math.max(Math.trunc(limitParam), 1), 50)
        : 20;
      const includeParam = String(req.query.include ?? 'active');
      const include: 'active' | 'all' = includeParam === 'all' ? 'all' : 'active';

      const matches = await container.matchmakingService.getMatchesForUser(
        req.actor!.did,
        { limit, include },
      );

      res.json({ matches, cursor: null });
    }),
  );

  // POST /api/v1/me/matches/:id/dismiss
  router.post(
    '/api/v1/me/matches/:id/dismiss',
    requireAuth,
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) throw new NotFoundError('Match not found');

      const row = await container.matchmakingService.dismissMatch(id, req.actor!.did);
      if (!row) throw new NotFoundError('Match not found');

      res.json({
        match: {
          id: row.id,
          dismissedAt: row.dismissed_at
            ? toIso(row.dismissed_at as Date)
            : null,
          actedOnAt: row.acted_on_at ? toIso(row.acted_on_at as Date) : null,
        },
      });
    }),
  );

  // POST /api/v1/me/matches/:id/act
  router.post(
    '/api/v1/me/matches/:id/act',
    requireAuth,
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) throw new NotFoundError('Match not found');

      const row = await container.matchmakingService.markActedOn(id, req.actor!.did);
      if (!row) throw new NotFoundError('Match not found');

      res.json({
        match: {
          id: row.id,
          dismissedAt: row.dismissed_at
            ? toIso(row.dismissed_at as Date)
            : null,
          actedOnAt: row.acted_on_at ? toIso(row.acted_on_at as Date) : null,
        },
      });
    }),
  );

  return router;
}

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}
