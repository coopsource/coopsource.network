import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { NotFoundError } from '@coopsource/common';

const CreateTriggerSchema = z.object({
  eventType: z.string().min(1).max(100),
  conditions: z.record(z.string(), z.unknown()).default({}),
  promptTemplate: z.string().min(1).max(10000),
  cooldownSeconds: z.number().int().min(0).default(0),
  enabled: z.boolean().default(true),
});

const UpdateTriggerSchema = z.object({
  eventType: z.string().min(1).max(100).optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
  promptTemplate: z.string().min(1).max(10000).optional(),
  cooldownSeconds: z.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
});

export function createAgentTriggerRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/agents/:id/triggers — list triggers for an agent
  router.get(
    '/api/v1/agents/:id/triggers',
    requireAuth,
    requirePermission('agent.configure'),
    asyncHandler(async (req, res) => {
      const triggers = await container.db
        .selectFrom('agent_trigger')
        .where('agent_config_id', '=', String(req.params.id))
        .where('cooperative_did', '=', req.actor!.cooperativeDid)
        .selectAll()
        .orderBy('created_at', 'asc')
        .execute();

      res.json({
        triggers: triggers.map((t) => ({
          id: t.id,
          agentConfigId: t.agent_config_id,
          eventType: t.event_type,
          conditions: t.conditions,
          promptTemplate: t.prompt_template,
          cooldownSeconds: t.cooldown_seconds,
          enabled: t.enabled,
          lastTriggeredAt: t.last_triggered_at,
          createdAt: t.created_at instanceof Date ? t.created_at.toISOString() : t.created_at,
          updatedAt: t.updated_at instanceof Date ? t.updated_at.toISOString() : t.updated_at,
        })),
      });
    }),
  );

  // POST /api/v1/agents/:id/triggers — create a trigger
  router.post(
    '/api/v1/agents/:id/triggers',
    requireAuth,
    requirePermission('agent.configure'),
    asyncHandler(async (req, res) => {
      const data = CreateTriggerSchema.parse(req.body);
      const agentConfigId = String(req.params.id);

      // Verify agent exists and belongs to this co-op
      const agent = await container.db
        .selectFrom('agent_config')
        .where('id', '=', agentConfigId)
        .where('cooperative_did', '=', req.actor!.cooperativeDid)
        .select('id')
        .executeTakeFirst();

      if (!agent) throw new NotFoundError('Agent not found');

      const [row] = await container.db
        .insertInto('agent_trigger')
        .values({
          agent_config_id: agentConfigId,
          cooperative_did: req.actor!.cooperativeDid,
          event_type: data.eventType,
          conditions: JSON.stringify(data.conditions),
          prompt_template: data.promptTemplate,
          cooldown_seconds: data.cooldownSeconds,
          enabled: data.enabled,
        })
        .returningAll()
        .execute();

      res.status(201).json({
        id: row!.id,
        agentConfigId: row!.agent_config_id,
        eventType: row!.event_type,
        conditions: row!.conditions,
        promptTemplate: row!.prompt_template,
        cooldownSeconds: row!.cooldown_seconds,
        enabled: row!.enabled,
        createdAt: row!.created_at instanceof Date ? row!.created_at.toISOString() : row!.created_at,
      });
    }),
  );

  // PUT /api/v1/agents/triggers/:triggerId — update a trigger
  router.put(
    '/api/v1/agents/triggers/:triggerId',
    requireAuth,
    requirePermission('agent.configure'),
    asyncHandler(async (req, res) => {
      const data = UpdateTriggerSchema.parse(req.body);
      const setValues: Record<string, unknown> = { updated_at: new Date() };

      if (data.eventType !== undefined) setValues.event_type = data.eventType;
      if (data.conditions !== undefined) setValues.conditions = JSON.stringify(data.conditions);
      if (data.promptTemplate !== undefined) setValues.prompt_template = data.promptTemplate;
      if (data.cooldownSeconds !== undefined) setValues.cooldown_seconds = data.cooldownSeconds;
      if (data.enabled !== undefined) setValues.enabled = data.enabled;

      const [row] = await container.db
        .updateTable('agent_trigger')
        .set(setValues)
        .where('id', '=', String(req.params.triggerId))
        .where('cooperative_did', '=', req.actor!.cooperativeDid)
        .returningAll()
        .execute();

      if (!row) throw new NotFoundError('Trigger not found');

      res.json({
        id: row.id,
        agentConfigId: row.agent_config_id,
        eventType: row.event_type,
        conditions: row.conditions,
        promptTemplate: row.prompt_template,
        cooldownSeconds: row.cooldown_seconds,
        enabled: row.enabled,
      });
    }),
  );

  // DELETE /api/v1/agents/triggers/:triggerId — delete a trigger
  router.delete(
    '/api/v1/agents/triggers/:triggerId',
    requireAuth,
    requirePermission('agent.configure'),
    asyncHandler(async (req, res) => {
      const result = await container.db
        .deleteFrom('agent_trigger')
        .where('id', '=', String(req.params.triggerId))
        .where('cooperative_did', '=', req.actor!.cooperativeDid)
        .executeTakeFirst();

      if (Number(result.numDeletedRows) === 0) {
        throw new NotFoundError('Trigger not found');
      }

      res.status(204).end();
    }),
  );

  return router;
}
