import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { WebhookEndpointTable, WebhookDeliveryLogTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateWebhookEndpointSchema,
  UpdateWebhookEndpointSchema,
} from '@coopsource/common';

function formatEndpoint(row: Selectable<WebhookEndpointTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    url: row.url,
    eventTypes: row.event_types,
    // Never expose the secret in responses
    enabled: row.enabled,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function formatDeliveryLog(row: Selectable<WebhookDeliveryLogTable>) {
  return {
    id: row.id,
    webhookEndpointId: row.webhook_endpoint_id,
    eventType: row.event_type,
    payload: row.payload,
    responseStatus: row.response_status,
    responseBody: row.response_body,
    attempts: Number(row.attempts),
    deliveredAt: row.delivered_at instanceof Date ? row.delivered_at.toISOString() : row.delivered_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export function createWebhookRoutes(container: Container): Router {
  const router = Router();

  // Create webhook endpoint
  router.post(
    '/api/v1/webhooks/endpoints',
    requireAuth,
    requirePermission('connector.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateWebhookEndpointSchema.parse(req.body);
      const endpoint = await container.eventBusService.createWebhookEndpoint(
        req.actor!.cooperativeDid,
        data,
      );
      res.status(201).json(formatEndpoint(endpoint));
    }),
  );

  // List webhook endpoints
  router.get(
    '/api/v1/webhooks/endpoints',
    requireAuth,
    asyncHandler(async (req, res) => {
      const endpoints = await container.eventBusService.listWebhookEndpoints(
        req.actor!.cooperativeDid,
      );
      res.json({ endpoints: endpoints.map(formatEndpoint) });
    }),
  );

  // Get webhook endpoint
  router.get(
    '/api/v1/webhooks/endpoints/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const endpoint = await container.eventBusService.getWebhookEndpoint(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.json(formatEndpoint(endpoint));
    }),
  );

  // Update webhook endpoint
  router.put(
    '/api/v1/webhooks/endpoints/:id',
    requireAuth,
    requirePermission('connector.manage'),
    asyncHandler(async (req, res) => {
      const data = UpdateWebhookEndpointSchema.parse(req.body);
      const endpoint = await container.eventBusService.updateWebhookEndpoint(
        String(req.params.id),
        req.actor!.cooperativeDid,
        data,
      );
      res.json(formatEndpoint(endpoint));
    }),
  );

  // Delete webhook endpoint
  router.delete(
    '/api/v1/webhooks/endpoints/:id',
    requireAuth,
    requirePermission('connector.manage'),
    asyncHandler(async (req, res) => {
      await container.eventBusService.deleteWebhookEndpoint(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.status(204).end();
    }),
  );

  // List delivery logs for an endpoint
  router.get(
    '/api/v1/webhooks/endpoints/:id/deliveries',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const page = await container.eventBusService.getDeliveryLogs(
        String(req.params.id),
        req.actor!.cooperativeDid,
        params,
      );
      res.json({ deliveries: page.items.map(formatDeliveryLog), cursor: page.cursor ?? null });
    }),
  );

  // Get event catalog
  router.get(
    '/api/v1/webhooks/events',
    requireAuth,
    asyncHandler(async (_req, res) => {
      const events = container.eventBusService.getEventCatalog();
      res.json({ events });
    }),
  );

  // Inbound webhook receiver (no auth — uses signature verification)
  router.post(
    '/api/v1/webhooks/inbound/:connectorType',
    asyncHandler(async (req, res) => {
      const connectorType = String(req.params.connectorType);
      const cooperativeDid = req.headers['x-cooperative-did']
        ? String(req.headers['x-cooperative-did'])
        : '';

      if (!cooperativeDid) {
        res.status(400).json({ error: 'VALIDATION', message: 'x-cooperative-did header is required' });
        return;
      }

      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') {
          headers[key] = value;
        }
      }

      const result = await container.webhookService.processInboundWebhook(
        cooperativeDid,
        connectorType,
        headers,
        req.body,
      );
      res.json(result);
    }),
  );

  return router;
}
