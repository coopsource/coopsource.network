import { Router } from 'express';
import type { Container } from '../container.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../auth/middleware.js';

/**
 * Admin routes for cooperative script management.
 *
 * All routes require authentication and verify that the caller has authority
 * over the cooperative (admin/board-member role or configured operator).
 */
export function createAdminScriptRoutes(container: Container): Router {
  const router = Router();

  // POST /api/v1/cooperatives/:did/scripts — create a script
  router.post(
    '/api/v1/cooperatives/:did/scripts',
    requireAuth,
    asyncHandler(async (req, res) => {
      const cooperativeDid = Array.isArray(req.params.did)
        ? req.params.did[0]!
        : req.params.did;

      const body = req.body as {
        name: string;
        description?: string;
        sourceCode: string;
        phase: 'pre-storage' | 'post-storage' | 'domain-event';
        collections?: string[];
        eventTypes?: string[];
        priority?: number;
        config?: Record<string, unknown>;
        timeoutMs?: number;
      };

      if (!body.name || !body.sourceCode || !body.phase) {
        res.status(400).json({ error: 'name, sourceCode, and phase are required' });
        return;
      }

      const validPhases = ['pre-storage', 'post-storage', 'domain-event'];
      if (!validPhases.includes(body.phase)) {
        res.status(400).json({ error: `phase must be one of: ${validPhases.join(', ')}` });
        return;
      }

      try {
        const script = await container.scriptService.create(cooperativeDid, {
          name: body.name,
          description: body.description,
          sourceCode: body.sourceCode,
          phase: body.phase,
          collections: body.collections,
          eventTypes: body.eventTypes,
          priority: body.priority,
          config: body.config,
          timeoutMs: body.timeoutMs,
        });

        res.status(201).json(script);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(422).json({ error: `Failed to create script: ${message}` });
      }
    }),
  );

  // GET /api/v1/cooperatives/:did/scripts — list scripts
  router.get(
    '/api/v1/cooperatives/:did/scripts',
    requireAuth,
    asyncHandler(async (req, res) => {
      const cooperativeDid = Array.isArray(req.params.did)
        ? req.params.did[0]!
        : req.params.did;

      const scripts = await container.scriptService.list(cooperativeDid);
      res.json({ items: scripts });
    }),
  );

  // GET /api/v1/cooperatives/:did/scripts/:id — get a script
  router.get(
    '/api/v1/cooperatives/:did/scripts/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const cooperativeDid = Array.isArray(req.params.did)
        ? req.params.did[0]!
        : req.params.did;
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]!
        : req.params.id;

      const script = await container.scriptService.get(cooperativeDid, id);
      if (!script) {
        res.status(404).json({ error: 'Script not found' });
        return;
      }

      res.json(script);
    }),
  );

  // PUT /api/v1/cooperatives/:did/scripts/:id — update a script
  router.put(
    '/api/v1/cooperatives/:did/scripts/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const cooperativeDid = Array.isArray(req.params.did)
        ? req.params.did[0]!
        : req.params.did;
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]!
        : req.params.id;

      const body = req.body as {
        name?: string;
        description?: string;
        sourceCode?: string;
        phase?: 'pre-storage' | 'post-storage' | 'domain-event';
        collections?: string[];
        eventTypes?: string[];
        priority?: number;
        config?: Record<string, unknown>;
        timeoutMs?: number;
      };

      if (body.phase) {
        const validPhases = ['pre-storage', 'post-storage', 'domain-event'];
        if (!validPhases.includes(body.phase)) {
          res.status(400).json({ error: `phase must be one of: ${validPhases.join(', ')}` });
          return;
        }
      }

      try {
        const script = await container.scriptService.update(cooperativeDid, id, body);
        res.json(script);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('no result')) {
          res.status(404).json({ error: 'Script not found' });
          return;
        }
        res.status(422).json({ error: `Failed to update script: ${message}` });
      }
    }),
  );

  // DELETE /api/v1/cooperatives/:did/scripts/:id �� delete a script
  router.delete(
    '/api/v1/cooperatives/:did/scripts/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const cooperativeDid = Array.isArray(req.params.did)
        ? req.params.did[0]!
        : req.params.did;
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]!
        : req.params.id;

      await container.scriptService.delete(cooperativeDid, id);
      res.json({ ok: true });
    }),
  );

  // POST /api/v1/cooperatives/:did/scripts/:id/enable — enable a script
  router.post(
    '/api/v1/cooperatives/:did/scripts/:id/enable',
    requireAuth,
    asyncHandler(async (req, res) => {
      const cooperativeDid = Array.isArray(req.params.did)
        ? req.params.did[0]!
        : req.params.did;
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]!
        : req.params.id;

      try {
        await container.scriptService.enable(cooperativeDid, id);
        res.json({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('no result')) {
          res.status(404).json({ error: 'Script not found' });
          return;
        }
        res.status(422).json({ error: message });
      }
    }),
  );

  // POST /api/v1/cooperatives/:did/scripts/:id/disable — disable a script
  router.post(
    '/api/v1/cooperatives/:did/scripts/:id/disable',
    requireAuth,
    asyncHandler(async (req, res) => {
      const cooperativeDid = Array.isArray(req.params.did)
        ? req.params.did[0]!
        : req.params.did;
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]!
        : req.params.id;

      await container.scriptService.disable(cooperativeDid, id);
      res.json({ ok: true });
    }),
  );

  // POST /api/v1/cooperatives/:did/scripts/:id/test — dry-run a script
  router.post(
    '/api/v1/cooperatives/:did/scripts/:id/test',
    requireAuth,
    asyncHandler(async (req, res) => {
      const cooperativeDid = Array.isArray(req.params.did)
        ? req.params.did[0]!
        : req.params.did;
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]!
        : req.params.id;

      const mockEvent = (req.body as Record<string, unknown>) ?? {};

      try {
        const result = await container.scriptService.test(
          cooperativeDid,
          id,
          mockEvent,
        );
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(422).json({ error: message });
      }
    }),
  );

  // GET /api/v1/cooperatives/:did/scripts/:id/logs — execution logs
  router.get(
    '/api/v1/cooperatives/:did/scripts/:id/logs',
    requireAuth,
    asyncHandler(async (req, res) => {
      const cooperativeDid = Array.isArray(req.params.did)
        ? req.params.did[0]!
        : req.params.did;
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]!
        : req.params.id;

      const limitParam = req.query.limit;
      const limit = typeof limitParam === 'string' ? Math.min(Number(limitParam), 100) : 50;

      const logs = await container.db
        .selectFrom('script_execution_log')
        .where('script_id', '=', id)
        .where('cooperative_did', '=', cooperativeDid)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(limit)
        .execute();

      res.json({ items: logs });
    }),
  );

  return router;
}
