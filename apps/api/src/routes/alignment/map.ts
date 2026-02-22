import { Router } from 'express';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';

export function createMapRoutes(container: Container): Router {
  const router = Router();

  // POST /api/v1/alignment/map/generate — Generate/regenerate interest map
  router.post(
    '/api/v1/alignment/map/generate',
    requireAuth,
    asyncHandler(async (req, res) => {
      const map = await container.alignmentService.generateMap(
        req.actor!.cooperativeDid,
        req.actor!.did,
      );

      res.status(201).json(formatMap(map));
    }),
  );

  // GET /api/v1/alignment/map — Get current interest map
  router.get(
    '/api/v1/alignment/map',
    requireAuth,
    asyncHandler(async (req, res) => {
      const map = await container.alignmentService.getMap(
        req.actor!.cooperativeDid,
      );

      res.json(map ? formatMap(map) : null);
    }),
  );

  return router;
}

function formatMap(row: Record<string, unknown>) {
  return {
    uri: row.uri,
    did: row.did,
    projectUri: row.project_uri,
    alignmentZones: row.alignment_zones,
    conflictZones: row.conflict_zones,
    aiAnalysis: row.ai_analysis,
    createdAt: (row.created_at as Date).toISOString(),
  };
}
