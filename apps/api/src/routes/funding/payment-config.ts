import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { PaymentProviderRegistry } from '../../payment/registry.js';

const CredentialsSchema = z.record(z.string(), z.string());

const AddProviderSchema = z.object({
  providerId: z.string(),
  displayName: z.string().min(1).max(100),
  credentials: CredentialsSchema,
  webhookSecret: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const UpdateProviderSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  credentials: CredentialsSchema.optional(),
  webhookSecret: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export function createPaymentConfigRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/payment-providers/supported — list supported provider types
  router.get(
    '/api/v1/payment-providers/supported',
    requireAuth,
    asyncHandler(async (_req, res) => {
      res.json({ providers: PaymentProviderRegistry.getSupportedProviders() });
    }),
  );

  // GET /api/v1/payment-providers — list configured providers for co-op
  router.get(
    '/api/v1/payment-providers',
    requireAuth,
    requirePermission('funding.manage'),
    asyncHandler(async (req, res) => {
      const configs = await container.paymentRegistry.listConfigs(
        req.actor!.cooperativeDid,
      );

      res.json({
        providers: configs.map((c) => ({
          id: c.id,
          providerId: c.provider_id,
          displayName: c.display_name,
          enabled: c.enabled,
          config: c.config,
          createdAt: c.created_at instanceof Date
            ? c.created_at.toISOString()
            : c.created_at,
          updatedAt: c.updated_at instanceof Date
            ? c.updated_at.toISOString()
            : c.updated_at,
        })),
      });
    }),
  );

  // POST /api/v1/payment-providers — add a provider config
  router.post(
    '/api/v1/payment-providers',
    requireAuth,
    requirePermission('funding.manage'),
    asyncHandler(async (req, res) => {
      const data = AddProviderSchema.parse(req.body);

      const config = await container.paymentRegistry.addConfig(
        req.actor!.cooperativeDid,
        data.providerId,
        data.displayName,
        data.credentials,
        data.webhookSecret,
        data.config,
      );

      res.status(201).json({
        id: config.id,
        providerId: config.provider_id,
        displayName: config.display_name,
        enabled: config.enabled,
        config: config.config,
        createdAt: config.created_at instanceof Date
          ? config.created_at.toISOString()
          : config.created_at,
        updatedAt: config.updated_at instanceof Date
          ? config.updated_at.toISOString()
          : config.updated_at,
      });
    }),
  );

  // PUT /api/v1/payment-providers/:providerId — update provider config
  router.put(
    '/api/v1/payment-providers/:providerId',
    requireAuth,
    requirePermission('funding.manage'),
    asyncHandler(async (req, res) => {
      const providerId = String(req.params.providerId);
      const data = UpdateProviderSchema.parse(req.body);

      const config = await container.paymentRegistry.updateConfig(
        req.actor!.cooperativeDid,
        providerId,
        data,
      );

      res.json({
        id: config.id,
        providerId: config.provider_id,
        displayName: config.display_name,
        enabled: config.enabled,
        config: config.config,
        createdAt: config.created_at instanceof Date
          ? config.created_at.toISOString()
          : config.created_at,
        updatedAt: config.updated_at instanceof Date
          ? config.updated_at.toISOString()
          : config.updated_at,
      });
    }),
  );

  // DELETE /api/v1/payment-providers/:providerId — remove provider config
  router.delete(
    '/api/v1/payment-providers/:providerId',
    requireAuth,
    requirePermission('funding.manage'),
    asyncHandler(async (req, res) => {
      await container.paymentRegistry.removeConfig(
        req.actor!.cooperativeDid,
        String(req.params.providerId),
      );
      res.status(204).end();
    }),
  );

  return router;
}
