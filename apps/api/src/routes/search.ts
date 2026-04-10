import { Router } from 'express';
import rateLimit from 'express-rate-limit';
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
 *
 * V8.8 — Adds /api/v1/search/people and /api/v1/search/alignment. Both are
 * auth-gated (D2: require active membership, mirroring /search/posts). The
 * people route enforces D1 hybrid discoverability in SQL; the alignment
 * route combines outcome FTS with interest tag overlap.
 */
export function createSearchRoutes(container: Container): Router {
  const router = Router();

  // Per-DID rate limiter for expensive FTS search endpoints.
  // Stricter than the global 200/15min — 60 requests per 15 minutes per user.
  // Skipped in test to avoid flaky E2E (mirrors pattern in index.ts).
  const searchLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // requireAuth runs before this middleware, so req.actor.did is always set.
    keyGenerator: (req) => req.actor!.did,
    skip: () => process.env.NODE_ENV === 'test',
    validate: { keyGeneratorIpFallback: false },
  });

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

  // V8.8 — People search. Auth-gated (active membership required via
  // requireAuth). The D1 hybrid privacy predicate
  // (profile.discoverable OR has stakeholder_interest) is enforced in SQL
  // inside SearchService.searchPeople — see that method for details.
  router.get(
    '/api/v1/search/people',
    requireAuth,
    searchLimiter,
    asyncHandler(async (req, res) => {
      const viewerDid = req.actor!.did;
      const q = String(req.query.q ?? '').trim();
      const { limit, cursor } = parsePagination(req.query as Record<string, unknown>);
      const result = await container.searchService.searchPeople(q, viewerDid, {
        limit,
        cursor,
      });

      res.json({
        people: result.items.map((row) => ({
          did: row.did,
          handle: row.handle,
          displayName: row.displayName,
          bio: row.bio,
          avatarCid: row.avatarCid,
          membershipCount: row.membershipCount,
        })),
        cursor: result.cursor,
      });
    }),
  );

  // V8.8 — Alignment matchmaking search. Auth-gated. Accepts either `q`
  // (outcome FTS) or `interests` (comma-separated tags) or both. Empty
  // inputs return an empty result (no SQL hit).
  router.get(
    '/api/v1/search/alignment',
    requireAuth,
    searchLimiter,
    asyncHandler(async (req, res) => {
      const viewerDid = req.actor!.did;
      const q = req.query.q ? String(req.query.q).trim() : undefined;
      const interests = req.query.interests
        ? String(req.query.interests)
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter((s) => s.length > 0)
        : undefined;

      if (!q && (!interests || interests.length === 0)) {
        res.json({ cooperatives: [], cursor: null });
        return;
      }

      const { limit, cursor } = parsePagination(req.query as Record<string, unknown>);
      const result = await container.searchService.searchAlignment(
        { q, interests, limit, cursor },
        viewerDid,
      );

      res.json({
        cooperatives: result.items.map((row) => ({
          did: row.did,
          handle: row.handle,
          displayName: row.displayName,
          cooperativeType: row.cooperativeType,
          matchedOutcomes: row.matchedOutcomes,
          matchedInterests: row.matchedInterests,
          alignmentScore: row.alignmentScore,
        })),
        cursor: result.cursor,
      });
    }),
  );

  return router;
}
