import { Router } from 'express';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth, requireAdmin } from '../../auth/middleware.js';
import { parsePagination } from '../../lib/pagination.js';
import { validateDid } from '../../lib/validate-params.js';

export function createNetworkRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/networks — list all networks (public)
  router.get(
    '/api/v1/networks',
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const result = await container.networkService.listNetworks(params);

      res.json({
        networks: result.items,
        cursor: result.cursor ?? null,
      });
    }),
  );

  // POST /api/v1/networks — create a network (admin only)
  router.post(
    '/api/v1/networks',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const { name, description, handle, cooperativeType } = req.body as {
        name?: string;
        description?: string;
        handle?: string;
        cooperativeType?: string;
      };

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: 'Name is required' },
        });
        return;
      }

      const result = await container.networkService.createNetwork({
        name: name.trim(),
        description,
        handle,
        cooperativeType,
        instanceUrl: process.env.INSTANCE_URL ?? 'http://localhost:3001',
      });

      res.status(201).json({ did: result.did });
    }),
  );

  // GET /api/v1/networks/:did — get network detail (public)
  router.get(
    '/api/v1/networks/:did',
    asyncHandler(async (req, res) => {
      const network = await container.networkService.getNetwork(
        validateDid(req.params.did),
      );

      res.json({
        did: network.did,
        handle: network.handle,
        displayName: network.displayName,
        description: network.description,
        cooperativeType: network.cooperativeType,
        membershipPolicy: network.membershipPolicy,
        memberCount: network.memberCount,
        website: network.website,
        createdAt: network.createdAt.toISOString(),
      });
    }),
  );

  // GET /api/v1/networks/:did/members — list network members (authenticated)
  router.get(
    '/api/v1/networks/:did/members',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const result = await container.networkService.listNetworkMembers(
        validateDid(req.params.did),
        params,
      );

      const members = result.items.map((m) => ({
        did: m.did,
        handle: m.handle,
        displayName: m.displayName,
        description: m.description,
        cooperativeType: m.cooperativeType,
        status: m.status,
        joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
      }));

      res.json({
        members,
        cursor: result.cursor ?? null,
      });
    }),
  );

  // POST /api/v1/networks/:did/join — join a network (admin only)
  router.post(
    '/api/v1/networks/:did/join',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      await container.networkService.joinNetwork({
        networkDid: validateDid(req.params.did),
        cooperativeDid: req.actor!.cooperativeDid,
        instanceUrl: process.env.INSTANCE_URL ?? 'http://localhost:3001',
      });

      res.status(201).json({ ok: true });
    }),
  );

  // DELETE /api/v1/networks/:did/leave — leave a network (admin only)
  router.delete(
    '/api/v1/networks/:did/leave',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      await container.networkService.leaveNetwork(
        validateDid(req.params.did),
        req.actor!.cooperativeDid,
      );

      res.status(204).send();
    }),
  );

  return router;
}
