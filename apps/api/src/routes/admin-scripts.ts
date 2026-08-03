import { Router } from 'express';
import type { Container } from '../container.js';

/**
 * Cooperative script management routes.
 *
 * DISABLED — Gate 0 containment for audit finding C-02 (2026-07-31 audit,
 * amendment AM-1): the in-process `node:vm` sandbox is escapable to Node.js
 * process access, so every script route is unreachable until scripting is
 * re-implemented in an isolated runner outside the API trust domain. The
 * in-process runner is never re-enabled.
 */
export function createAdminScriptRoutes(_container: Container): Router {
  const router = Router();

  const disabled = (_req: import('express').Request, res: import('express').Response): void => {
    res.status(410).json({
      error:
        'Cooperative scripting is disabled pending an isolated script runner (audit C-02 / AM-1)',
    });
  };

  router.all('/api/v1/cooperatives/:did/scripts', disabled);
  router.all('/api/v1/cooperatives/:did/scripts/:id', disabled);
  router.all('/api/v1/cooperatives/:did/scripts/:id/:action', disabled);

  return router;
}
