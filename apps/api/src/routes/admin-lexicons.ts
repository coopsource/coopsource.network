import { Router } from 'express';
import type { Container } from '../container.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth, requireAdmin } from '../auth/middleware.js';

export function createAdminLexiconRoutes(container: Container): Router {
  const router = Router();

  // POST /api/v1/admin/lexicons — register a new lexicon
  router.post(
    '/api/v1/admin/lexicons',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const { nsid, lexiconDoc, fieldMappings } = req.body as {
        nsid?: string;
        lexiconDoc?: Record<string, unknown>;
        fieldMappings?: Record<string, unknown>;
      };

      if (!nsid || typeof nsid !== 'string') {
        res.status(400).json({
          error: { code: 'BAD_REQUEST', message: 'nsid is required and must be a string' },
        });
        return;
      }

      if (!lexiconDoc || typeof lexiconDoc !== 'object') {
        res.status(400).json({
          error: { code: 'BAD_REQUEST', message: 'lexiconDoc is required and must be an object' },
        });
        return;
      }

      const registeredBy = req.actor?.did ?? 'unknown';

      await container.lexiconManagementService.registerLexicon(
        nsid,
        lexiconDoc,
        (fieldMappings ?? null) as Parameters<typeof container.lexiconManagementService.registerLexicon>[2],
        registeredBy,
      );

      res.status(201).json({ nsid, registered: true });
    }),
  );

  // GET /api/v1/admin/lexicons — list all lexicons
  router.get(
    '/api/v1/admin/lexicons',
    requireAuth,
    requireAdmin,
    asyncHandler(async (_req, res) => {
      const entries = await container.lexiconManagementService.listLexicons();
      res.json({ lexicons: entries });
    }),
  );

  // GET /api/v1/admin/lexicons/:nsid — get a single lexicon
  router.get(
    '/api/v1/admin/lexicons/:nsid',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      // Express 5: params can be string | string[]
      const nsid = Array.isArray(req.params.nsid) ? req.params.nsid[0] : req.params.nsid;
      if (!nsid) {
        res.status(400).json({
          error: { code: 'BAD_REQUEST', message: 'nsid parameter is required' },
        });
        return;
      }

      const detail = await container.lexiconManagementService.getLexicon(nsid);

      if (!detail) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: `Lexicon not found: ${nsid}` },
        });
        return;
      }

      res.json(detail);
    }),
  );

  // DELETE /api/v1/admin/lexicons/:nsid — remove a registered lexicon
  router.delete(
    '/api/v1/admin/lexicons/:nsid',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const nsid = Array.isArray(req.params.nsid) ? req.params.nsid[0] : req.params.nsid;
      if (!nsid) {
        res.status(400).json({
          error: { code: 'BAD_REQUEST', message: 'nsid parameter is required' },
        });
        return;
      }

      const deleted = await container.lexiconManagementService.removeLexicon(nsid);

      if (!deleted) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: `Registered lexicon not found: ${nsid}` },
        });
        return;
      }

      res.json({ nsid, removed: true });
    }),
  );

  return router;
}
