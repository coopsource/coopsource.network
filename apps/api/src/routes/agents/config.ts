import { Router } from 'express';
import {
  CreateAgentConfigSchema,
  UpdateAgentConfigSchema,
  CreateAgentFromTemplateSchema,
} from '@coopsource/common';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';

export function createAgentConfigRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/agents — list agents for the co-op
  router.get(
    '/api/v1/agents',
    requireAuth,
    requirePermission('agent.use'),
    asyncHandler(async (req, res) => {
      const cursor = req.query.cursor as string | undefined;
      const agents = await container.agentService.listAgents(
        req.actor!.cooperativeDid,
        cursor,
      );
      res.json({ agents });
    }),
  );

  // GET /api/v1/agents/models — list available models for the co-op
  router.get(
    '/api/v1/agents/models',
    requireAuth,
    requirePermission('agent.use'),
    asyncHandler(async (req, res) => {
      const providers = await container.agentService.getAvailableModels(
        req.actor!.cooperativeDid,
      );
      res.json({ providers });
    }),
  );

  // GET /api/v1/agents/:id — get a single agent
  router.get(
    '/api/v1/agents/:id',
    requireAuth,
    requirePermission('agent.use'),
    asyncHandler(async (req, res) => {
      const agent = await container.agentService.getAgent(
        req.actor!.cooperativeDid,
        String(req.params.id),
      );
      res.json(agent);
    }),
  );

  // POST /api/v1/agents — create an agent
  router.post(
    '/api/v1/agents',
    requireAuth,
    requirePermission('agent.configure'),
    asyncHandler(async (req, res) => {
      const data = CreateAgentConfigSchema.parse(req.body);
      const agent = await container.agentService.createAgent(
        req.actor!.did,
        req.actor!.cooperativeDid,
        data,
      );
      res.status(201).json(agent);
    }),
  );

  // POST /api/v1/agents/from-template — create from template
  router.post(
    '/api/v1/agents/from-template',
    requireAuth,
    requirePermission('agent.configure'),
    asyncHandler(async (req, res) => {
      const data = CreateAgentFromTemplateSchema.parse(req.body);
      const agent = await container.agentService.createFromTemplate(
        req.actor!.did,
        req.actor!.cooperativeDid,
        data,
      );
      res.status(201).json(agent);
    }),
  );

  // PUT /api/v1/agents/:id — update an agent
  router.put(
    '/api/v1/agents/:id',
    requireAuth,
    requirePermission('agent.configure'),
    asyncHandler(async (req, res) => {
      const data = UpdateAgentConfigSchema.parse(req.body);
      const agent = await container.agentService.updateAgent(
        req.actor!.cooperativeDid,
        String(req.params.id),
        data,
      );
      res.json(agent);
    }),
  );

  // DELETE /api/v1/agents/:id — delete an agent
  router.delete(
    '/api/v1/agents/:id',
    requireAuth,
    requirePermission('agent.configure'),
    asyncHandler(async (req, res) => {
      await container.agentService.deleteAgent(
        req.actor!.cooperativeDid,
        String(req.params.id),
      );
      res.status(204).end();
    }),
  );

  // GET /api/v1/agents/:id/usage — get usage stats for an agent
  router.get(
    '/api/v1/agents/:id/usage',
    requireAuth,
    requirePermission('agent.configure'),
    asyncHandler(async (req, res) => {
      const period = req.query.period as string | undefined;
      const usage = await container.agentService.getAgentUsage(
        String(req.params.id),
        period,
      );
      res.json({ usage: usage ?? null });
    }),
  );

  return router;
}
