import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { MentionTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { parsePagination } from '../../lib/pagination.js';
import { CreateMentionSchema } from '@coopsource/common';

function formatMention(row: Selectable<MentionTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    sourceType: row.source_type,
    sourceId: row.source_id,
    mentionedDid: row.mentioned_did,
    mentionedBy: row.mentioned_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    readAt: row.read_at instanceof Date ? row.read_at.toISOString() : row.read_at,
  };
}

export function createMentionRoutes(container: Container): Router {
  const router = Router();

  router.post(
    '/api/v1/mentions',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = CreateMentionSchema.parse(req.body);
      const mention = await container.mentionService.createMention(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.status(201).json(formatMention(mention));
    }),
  );

  router.get(
    '/api/v1/mentions',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const mentionedDid = req.query.mentionedDid ? String(req.query.mentionedDid) : undefined;
      const page = await container.mentionService.getUnreadMentions(
        req.actor!.cooperativeDid,
        mentionedDid,
        params,
      );
      res.json({ items: page.items.map(formatMention), cursor: page.cursor ?? null });
    }),
  );

  router.post(
    '/api/v1/mentions/:id/read',
    requireAuth,
    asyncHandler(async (req, res) => {
      const mention = await container.mentionService.markAsRead(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.json(formatMention(mention));
    }),
  );

  router.post(
    '/api/v1/mentions/read-all',
    requireAuth,
    asyncHandler(async (req, res) => {
      const count = await container.mentionService.markAllAsRead(
        req.actor!.cooperativeDid,
      );
      res.json({ marked: count });
    }),
  );

  router.get(
    '/api/v1/mentions/count',
    requireAuth,
    asyncHandler(async (req, res) => {
      const mentionedDid = req.query.mentionedDid ? String(req.query.mentionedDid) : undefined;
      const count = await container.mentionService.getUnreadCount(
        req.actor!.cooperativeDid,
        mentionedDid,
      );
      res.json({ count });
    }),
  );

  return router;
}
