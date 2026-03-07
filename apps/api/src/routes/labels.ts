import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import type { GovernanceLabeler } from '../services/governance-labeler.js';

export function createLabelRoutes(labeler: GovernanceLabeler): Router {
  const router = Router();

  // GET /api/v1/labels?subject=<at-uri>
  // GET /api/v1/labels?value=<label-value>
  router.get(
    '/api/v1/labels',
    asyncHandler(async (req: Request, res: Response) => {
      const subject = req.query.subject as string | undefined;
      const value = req.query.value as string | undefined;

      if (subject) {
        const labels = await labeler.getLabelsForSubject(subject);
        return res.json({ labels });
      }

      if (value) {
        const limit = Math.min(Number(req.query.limit) || 50, 100);
        const labels = await labeler.queryLabels(value, limit);
        return res.json({ labels });
      }

      return res.status(400).json({ error: 'Must provide either subject or value query parameter' });
    }),
  );

  return router;
}
