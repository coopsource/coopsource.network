import { Router } from 'express';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import {
  CreateInterestSchema,
  UpdateInterestSchema,
} from '@coopsource/common';

export function createInterestRoutes(container: Container): Router {
  const router = Router();

  // POST /api/v1/alignment/interests — Submit my interests
  router.post(
    '/api/v1/alignment/interests',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = CreateInterestSchema.parse(req.body);

      const interest = await container.alignmentService.submitInterests(
        req.actor!.did,
        req.actor!.cooperativeDid,
        data,
      );

      res.status(201).json(formatInterest(interest));
    }),
  );

  // GET /api/v1/alignment/interests/me — Get my interests
  router.get(
    '/api/v1/alignment/interests/me',
    requireAuth,
    asyncHandler(async (req, res) => {
      const interest = await container.alignmentService.getMyInterests(
        req.actor!.did,
        req.actor!.cooperativeDid,
      );

      if (!interest) {
        res.json(null);
        return;
      }

      res.json(formatInterest(interest));
    }),
  );

  // GET /api/v1/alignment/interests — List all stakeholder interests
  router.get(
    '/api/v1/alignment/interests',
    requireAuth,
    asyncHandler(async (req, res) => {
      const interests = await container.alignmentService.getInterests(
        req.actor!.cooperativeDid,
      );

      res.json({
        interests: interests.map(formatInterest),
      });
    }),
  );

  // PUT /api/v1/alignment/interests — Update my interests
  router.put(
    '/api/v1/alignment/interests',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = UpdateInterestSchema.parse(req.body);

      const interest = await container.alignmentService.updateInterests(
        req.actor!.did,
        req.actor!.cooperativeDid,
        data,
      );

      res.json(formatInterest(interest));
    }),
  );

  return router;
}

function formatInterest(row: Record<string, unknown>) {
  return {
    uri: row.uri,
    did: row.did,
    projectUri: row.project_uri,
    interests: row.interests,
    contributions: row.contributions,
    constraints: row.constraints,
    redLines: row.red_lines,
    preferences: row.preferences,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}
