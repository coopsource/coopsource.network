import { Router } from 'express';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { ConnectServiceSchema, BindResourceSchema } from '@coopsource/common';
import type { SupportedService } from '../../lib/oauth/index.js';
import type { AppConfig } from '../../config.js';

export function createConnectionRoutes(
  container: Container,
  config: AppConfig,
): Router {
  const router = Router();

  // GET /api/v1/connections — List my connections
  router.get(
    '/api/v1/connections',
    requireAuth,
    asyncHandler(async (req, res) => {
      const connections = await container.connectionService.listConnections(
        req.actor!.did,
      );
      res.json({ connections: connections.map(formatConnection) });
    }),
  );

  // GET /api/v1/connections/available — Which services are configured
  router.get(
    '/api/v1/connections/available',
    requireAuth,
    asyncHandler(async (_req, res) => {
      const services = container.connectionService.getAvailableServices();
      res.json({ services });
    }),
  );

  // POST /api/v1/connections/initiate — Start OAuth flow
  router.post(
    '/api/v1/connections/initiate',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { service } = ConnectServiceSchema.parse(req.body);

      const result = container.connectionService.initiateConnection(
        req.actor!.did,
        service as SupportedService,
      );

      res.json({ authUrl: result.authUrl, state: result.state });
    }),
  );

  // GET /api/v1/connections/callback/:service — OAuth callback
  router.get(
    '/api/v1/connections/callback/:service',
    asyncHandler(async (req, res) => {
      const service = req.params.service as 'github' | 'google';
      const code = String(req.query.code ?? '');
      const state = String(req.query.state ?? '');

      if (!code || !state) {
        res.redirect(`${config.FRONTEND_URL}/settings/connections?error=missing_params`);
        return;
      }

      try {
        await container.connectionService.completeConnection(service, code, state);
        res.redirect(`${config.FRONTEND_URL}/settings/connections?connected=${service}`);
      } catch {
        res.redirect(`${config.FRONTEND_URL}/settings/connections?error=oauth_failed`);
      }
    }),
  );

  // DELETE /api/v1/connections/:uri — Revoke connection
  router.delete(
    '/api/v1/connections/:uri',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      await container.connectionService.revokeConnection(uri, req.actor!.did);
      res.status(204).send();
    }),
  );

  // POST /api/v1/connections/:uri/bind — Bind a resource
  router.post(
    '/api/v1/connections/:uri/bind',
    requireAuth,
    asyncHandler(async (req, res) => {
      const connectionUri = decodeURIComponent(String(req.params.uri));
      const data = BindResourceSchema.parse(req.body);

      const binding = await container.connectionService.bindResource(
        req.actor!.did,
        connectionUri,
        data,
      );

      res.status(201).json(formatBinding(binding));
    }),
  );

  // GET /api/v1/connections/:uri/bindings — List bindings for a connection
  router.get(
    '/api/v1/connections/:uri/bindings',
    requireAuth,
    asyncHandler(async (req, res) => {
      const connectionUri = decodeURIComponent(String(req.params.uri));
      const bindings = await container.connectionService.listBindings(connectionUri);
      res.json({ bindings: bindings.map(formatBinding) });
    }),
  );

  // DELETE /api/v1/connections/bindings/:uri — Remove a binding
  router.delete(
    '/api/v1/connections/bindings/:uri',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      await container.connectionService.removeBinding(uri, req.actor!.did);
      res.status(204).send();
    }),
  );

  return router;
}

function formatConnection(row: Record<string, unknown>) {
  return {
    uri: row.uri,
    did: row.did,
    service: row.service,
    status: row.status,
    metadata: row.metadata,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

function formatBinding(row: Record<string, unknown>) {
  return {
    uri: row.uri,
    did: row.did,
    connectionUri: row.connection_uri,
    projectUri: row.project_uri,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    metadata: row.metadata,
    createdAt: (row.created_at as Date).toISOString(),
  };
}
