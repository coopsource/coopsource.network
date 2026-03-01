import { Router } from 'express';
import { SendAgentMessageSchema } from '@coopsource/common';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';

export function createAgentChatRoutes(container: Container): Router {
  const router = Router();

  // POST /api/v1/agents/:id/chat — send message (full response)
  router.post(
    '/api/v1/agents/:id/chat',
    requireAuth,
    requirePermission('agent.use'),
    asyncHandler(async (req, res) => {
      const data = SendAgentMessageSchema.parse(req.body);

      const result = await container.chatEngine.send({
        agentId: String(req.params.id),
        userDid: req.actor!.did,
        cooperativeDid: req.actor!.cooperativeDid,
        message: data.message,
        sessionId: data.sessionId,
        modelOverride: data.model,
      });

      res.json(result);
    }),
  );

  // POST /api/v1/agents/:id/chat/stream — send message (SSE stream)
  router.post(
    '/api/v1/agents/:id/chat/stream',
    requireAuth,
    requirePermission('agent.use'),
    asyncHandler(async (req, res) => {
      const data = SendAgentMessageSchema.parse(req.body);

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      try {
        for await (const event of container.chatEngine.sendStream({
          agentId: String(req.params.id),
          userDid: req.actor!.did,
          cooperativeDid: req.actor!.cooperativeDid,
          message: data.message,
          sessionId: data.sessionId,
          modelOverride: data.model,
        })) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }

        res.write('data: [DONE]\n\n');
      } catch (err) {
        res.write(
          `data: ${JSON.stringify({ type: 'error', content: err instanceof Error ? err.message : 'Unknown error' })}\n\n`,
        );
      } finally {
        res.end();
      }
    }),
  );

  // GET /api/v1/agents/:id/sessions — list sessions for an agent
  router.get(
    '/api/v1/agents/:id/sessions',
    requireAuth,
    requirePermission('agent.use'),
    asyncHandler(async (req, res) => {
      const cursor = req.query.cursor as string | undefined;
      const sessions = await container.agentService.listSessions(
        String(req.params.id),
        req.actor!.did,
        cursor,
      );

      res.json({
        sessions: sessions.map((s) => ({
          id: s.id,
          agentConfigId: s.agent_config_id,
          title: s.title,
          status: s.status,
          totalInputTokens: s.total_input_tokens,
          totalOutputTokens: s.total_output_tokens,
          totalCostMicrodollars: s.total_cost_microdollars,
          createdAt:
            s.created_at instanceof Date
              ? s.created_at.toISOString()
              : s.created_at,
          updatedAt:
            s.updated_at instanceof Date
              ? s.updated_at.toISOString()
              : s.updated_at,
        })),
      });
    }),
  );

  // GET /api/v1/agents/sessions/:sessionId/messages — message history
  router.get(
    '/api/v1/agents/sessions/:sessionId/messages',
    requireAuth,
    requirePermission('agent.use'),
    asyncHandler(async (req, res) => {
      const cursor = req.query.cursor as string | undefined;
      const messages = await container.agentService.getSessionMessages(
        String(req.params.sessionId),
        req.actor!.did,
        cursor,
      );

      res.json({
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          toolCalls: m.tool_calls,
          inputTokens: m.input_tokens,
          outputTokens: m.output_tokens,
          costMicrodollars: m.cost_microdollars,
          model: m.model,
          createdAt:
            m.created_at instanceof Date
              ? m.created_at.toISOString()
              : m.created_at,
        })),
      });
    }),
  );

  // DELETE /api/v1/agents/sessions/:sessionId — close a session
  router.delete(
    '/api/v1/agents/sessions/:sessionId',
    requireAuth,
    requirePermission('agent.use'),
    asyncHandler(async (req, res) => {
      await container.db
        .updateTable('agent_session')
        .set({ status: 'closed', updated_at: new Date() })
        .where('id', '=', String(req.params.sessionId))
        .where('user_did', '=', req.actor!.did)
        .execute();

      res.status(204).end();
    }),
  );

  return router;
}
