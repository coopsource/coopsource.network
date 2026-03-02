import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { NotFoundError } from '@coopsource/common';

const ConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['eq', 'neq', 'contains', 'gt', 'lt']),
  value: z.unknown(),
});

const ActionSchema = z.object({
  type: z.enum(['agent_message', 'call_webhook', 'notify']),
  config: z.record(z.string(), z.unknown()).default({}),
});

const CreateTriggerSchema = z
  .object({
    eventType: z.string().min(1).max(100),
    conditions: z.array(ConditionSchema).max(20).default([]),
    actions: z.array(ActionSchema).max(20).default([]),
    promptTemplate: z.string().min(1).max(10000).optional(),
    cooldownSeconds: z.number().int().min(0).default(0),
    enabled: z.boolean().default(true),
  })
  .refine(
    (data) => {
      // No actions = implicit agent_message, needs top-level template
      if (data.actions.length === 0) return !!data.promptTemplate;
      // Each agent_message action needs either its own config.promptTemplate or the top-level one
      const agentActions = data.actions.filter((a) => a.type === 'agent_message');
      if (agentActions.length === 0) return true;
      return agentActions.every((a) => a.config.promptTemplate) || !!data.promptTemplate;
    },
    {
      message:
        'promptTemplate is required when actions is empty or contains agent_message without its own template',
    },
  );

const UpdateTriggerSchema = z.object({
  eventType: z.string().min(1).max(100).optional(),
  conditions: z.array(ConditionSchema).max(20).optional(),
  actions: z.array(ActionSchema).max(20).optional(),
  promptTemplate: z.string().min(1).max(10000).optional().nullable(),
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
          actions: t.actions,
          promptTemplate: t.prompt_template,
          cooldownSeconds: t.cooldown_seconds,
          enabled: t.enabled,
          lastTriggeredAt: t.last_triggered_at,
          createdAt:
            t.created_at instanceof Date
              ? t.created_at.toISOString()
              : t.created_at,
          updatedAt:
            t.updated_at instanceof Date
              ? t.updated_at.toISOString()
              : t.updated_at,
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
          actions: JSON.stringify(data.actions),
          prompt_template: data.promptTemplate ?? null,
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
        actions: row!.actions,
        promptTemplate: row!.prompt_template,
        cooldownSeconds: row!.cooldown_seconds,
        enabled: row!.enabled,
        createdAt:
          row!.created_at instanceof Date
            ? row!.created_at.toISOString()
            : row!.created_at,
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
      if (data.conditions !== undefined)
        setValues.conditions = JSON.stringify(data.conditions);
      if (data.actions !== undefined)
        setValues.actions = JSON.stringify(data.actions);
      if (data.promptTemplate !== undefined)
        setValues.prompt_template = data.promptTemplate;
      if (data.cooldownSeconds !== undefined)
        setValues.cooldown_seconds = data.cooldownSeconds;
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
        actions: row.actions,
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

  // GET /api/v1/agents/triggers/:triggerId/executions — list execution logs
  router.get(
    '/api/v1/agents/triggers/:triggerId/executions',
    requireAuth,
    requirePermission('agent.configure'),
    asyncHandler(async (req, res) => {
      const triggerId = String(req.params.triggerId);
      const limit = Math.min(
        Math.max(Number(req.query.limit) || 25, 1),
        100,
      );
      const cursor = req.query.cursor as string | undefined;

      let query = container.db
        .selectFrom('trigger_execution_log')
        .where('trigger_id', '=', triggerId)
        .where('cooperative_did', '=', req.actor!.cooperativeDid)
        .selectAll()
        .orderBy('started_at', 'desc')
        .limit(limit + 1);

      if (cursor) {
        query = query.where('started_at', '<', new Date(cursor));
      }

      const rows = await query.execute();
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;

      res.json({
        executions: items.map((r) => ({
          id: r.id,
          triggerId: r.trigger_id,
          eventType: r.event_type,
          eventData: r.event_data,
          conditionsMatched: r.conditions_matched,
          actionsExecuted: r.actions_executed,
          status: r.status,
          error: r.error,
          startedAt:
            r.started_at instanceof Date
              ? r.started_at.toISOString()
              : r.started_at,
          completedAt: r.completed_at
            ? r.completed_at instanceof Date
              ? r.completed_at.toISOString()
              : r.completed_at
            : null,
          durationMs: r.duration_ms,
        })),
        cursor: hasMore
          ? items[items.length - 1]!.started_at instanceof Date
            ? (items[items.length - 1]!.started_at as Date).toISOString()
            : String(items[items.length - 1]!.started_at)
          : undefined,
      });
    }),
  );

  return router;
}
