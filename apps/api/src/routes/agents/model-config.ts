import { Router } from 'express';
import {
  AddModelProviderSchema,
  UpdateModelProviderSchema,
} from '@coopsource/common';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { ModelProviderRegistry } from '../../ai/model-provider-registry.js';

export function createModelConfigRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/model-providers/supported — list supported provider types
  router.get(
    '/api/v1/model-providers/supported',
    requireAuth,
    asyncHandler(async (_req, res) => {
      res.json({ providers: ModelProviderRegistry.getSupportedProviders() });
    }),
  );

  // GET /api/v1/model-providers — list configured providers for co-op
  router.get(
    '/api/v1/model-providers',
    requireAuth,
    requirePermission('agent.configure'),
    asyncHandler(async (req, res) => {
      const configs = await container.modelProviderRegistry.listConfigs(
        req.actor!.cooperativeDid,
      );

      res.json({
        providers: configs.map((c) => ({
          id: c.id,
          providerId: c.provider_id,
          displayName: c.display_name,
          enabled: c.enabled,
          allowedModels: c.allowed_models,
          config: c.config,
          createdAt:
            c.created_at instanceof Date
              ? c.created_at.toISOString()
              : c.created_at,
          updatedAt:
            c.updated_at instanceof Date
              ? c.updated_at.toISOString()
              : c.updated_at,
        })),
      });
    }),
  );

  // POST /api/v1/model-providers — add a provider config
  router.post(
    '/api/v1/model-providers',
    requireAuth,
    requirePermission('agent.admin'),
    asyncHandler(async (req, res) => {
      const data = AddModelProviderSchema.parse(req.body);

      const config = await container.modelProviderRegistry.addConfig(
        req.actor!.cooperativeDid,
        data.providerId,
        data.displayName,
        data.credentials,
        data.allowedModels,
        data.config,
      );

      res.status(201).json({
        id: config.id,
        providerId: config.provider_id,
        displayName: config.display_name,
        enabled: config.enabled,
        allowedModels: config.allowed_models,
        config: config.config,
        createdAt:
          config.created_at instanceof Date
            ? config.created_at.toISOString()
            : config.created_at,
        updatedAt:
          config.updated_at instanceof Date
            ? config.updated_at.toISOString()
            : config.updated_at,
      });
    }),
  );

  // PUT /api/v1/model-providers/:providerId — update provider config
  router.put(
    '/api/v1/model-providers/:providerId',
    requireAuth,
    requirePermission('agent.admin'),
    asyncHandler(async (req, res) => {
      const providerId = String(req.params.providerId);
      const data = UpdateModelProviderSchema.parse(req.body);

      const config = await container.modelProviderRegistry.updateConfig(
        req.actor!.cooperativeDid,
        providerId,
        data,
      );

      res.json({
        id: config.id,
        providerId: config.provider_id,
        displayName: config.display_name,
        enabled: config.enabled,
        allowedModels: config.allowed_models,
        config: config.config,
        createdAt:
          config.created_at instanceof Date
            ? config.created_at.toISOString()
            : config.created_at,
        updatedAt:
          config.updated_at instanceof Date
            ? config.updated_at.toISOString()
            : config.updated_at,
      });
    }),
  );

  // DELETE /api/v1/model-providers/:providerId — remove provider config
  router.delete(
    '/api/v1/model-providers/:providerId',
    requireAuth,
    requirePermission('agent.admin'),
    asyncHandler(async (req, res) => {
      await container.modelProviderRegistry.removeConfig(
        req.actor!.cooperativeDid,
        String(req.params.providerId),
      );
      res.status(204).end();
    }),
  );

  return router;
}
