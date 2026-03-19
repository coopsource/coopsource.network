import { Router } from 'express';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';

export function createDashboardRoutes(container: Container): Router {
  const router = Router();

  router.get(
    '/api/v1/dashboards/engagement',
    requireAuth,
    asyncHandler(async (req, res) => {
      const startDate = String(req.query.startDate ?? '');
      const endDate = String(req.query.endDate ?? '');
      if (!startDate || !endDate) {
        res.status(400).json({ error: 'VALIDATION', message: 'startDate and endDate are required' });
        return;
      }
      const engagement = await container.dashboardService.getMemberEngagement(
        req.actor!.cooperativeDid,
        startDate,
        endDate,
      );
      res.json(engagement);
    }),
  );

  router.get(
    '/api/v1/dashboards/financial',
    requireAuth,
    asyncHandler(async (req, res) => {
      const startDate = String(req.query.startDate ?? '');
      const endDate = String(req.query.endDate ?? '');
      if (!startDate || !endDate) {
        res.status(400).json({ error: 'VALIDATION', message: 'startDate and endDate are required' });
        return;
      }
      const summary = await container.dashboardService.getFinancialSummary(
        req.actor!.cooperativeDid,
        startDate,
        endDate,
      );
      res.json(summary);
    }),
  );

  router.get(
    '/api/v1/dashboards/operational',
    requireAuth,
    asyncHandler(async (req, res) => {
      const startDate = String(req.query.startDate ?? '');
      const endDate = String(req.query.endDate ?? '');
      if (!startDate || !endDate) {
        res.status(400).json({ error: 'VALIDATION', message: 'startDate and endDate are required' });
        return;
      }
      const summary = await container.dashboardService.getOperationalSummary(
        req.actor!.cooperativeDid,
        startDate,
        endDate,
      );
      res.json(summary);
    }),
  );

  return router;
}
