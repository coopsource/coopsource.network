import { Router } from 'express';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { parsePagination } from '../../lib/pagination.js';
import { CreateOutcomeSchema } from '@coopsource/common';
import { z } from 'zod';

const SupportSchema = z.object({
  level: z.enum(['strong', 'moderate', 'conditional', 'neutral', 'opposed']),
  conditions: z.string().max(2000).optional(),
});

const StatusTransitionSchema = z.object({
  status: z.enum(['endorsed', 'active', 'achieved', 'abandoned']),
});

export function createOutcomeRoutes(container: Container): Router {
  const router = Router();

  // POST /api/v1/alignment/outcomes — Create desired outcome
  router.post(
    '/api/v1/alignment/outcomes',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = CreateOutcomeSchema.parse(req.body);

      const outcome = await container.alignmentService.createOutcome(
        req.actor!.did,
        req.actor!.cooperativeDid,
        data,
      );

      res.status(201).json(formatOutcome(outcome));
    }),
  );

  // GET /api/v1/alignment/outcomes — List outcomes
  router.get(
    '/api/v1/alignment/outcomes',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query);
      const status = req.query.status ? String(req.query.status) : undefined;

      const page = await container.alignmentService.listOutcomes(
        req.actor!.cooperativeDid,
        { ...params, status },
      );

      res.json({
        outcomes: page.items.map(formatOutcome),
        cursor: page.cursor,
      });
    }),
  );

  // GET /api/v1/alignment/outcomes/:uri — Get single outcome
  router.get(
    '/api/v1/alignment/outcomes/:uri',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const outcome = await container.alignmentService.getOutcome(uri);
      res.json(formatOutcome(outcome));
    }),
  );

  // POST /api/v1/alignment/outcomes/:uri/support — Add stakeholder support
  router.post(
    '/api/v1/alignment/outcomes/:uri/support',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const { level, conditions } = SupportSchema.parse(req.body);

      const outcome = await container.alignmentService.supportOutcome(
        req.actor!.did,
        uri,
        level,
        conditions,
      );

      res.json(formatOutcome(outcome));
    }),
  );

  // POST /api/v1/alignment/outcomes/:uri/status — Update outcome status
  router.post(
    '/api/v1/alignment/outcomes/:uri/status',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const { status } = StatusTransitionSchema.parse(req.body);

      const outcome = await container.alignmentService.updateOutcomeStatus(
        uri,
        req.actor!.did,
        status,
      );

      res.json(formatOutcome(outcome));
    }),
  );

  return router;
}

function formatOutcome(row: Record<string, unknown>) {
  return {
    uri: row.uri,
    did: row.did,
    projectUri: row.project_uri,
    title: row.title,
    description: row.description,
    category: row.category,
    successCriteria: row.success_criteria,
    stakeholderSupport: row.stakeholder_support,
    status: row.status,
    createdAt: (row.created_at as Date).toISOString(),
  };
}
