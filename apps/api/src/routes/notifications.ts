import { Router } from 'express';
import type { Container } from '../container.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../auth/middleware.js';
import { NotFoundError } from '@coopsource/common';

export function createNotificationRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/notifications — list notifications for current user
  router.get(
    '/api/v1/notifications',
    requireAuth,
    asyncHandler(async (req, res) => {
      const limit = Math.min(
        Math.max(Number(req.query.limit) || 25, 1),
        100,
      );
      const cursor = req.query.cursor as string | undefined;

      let query = container.db
        .selectFrom('notification')
        .where('recipient_did', '=', req.actor!.did)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(limit + 1);

      if (cursor) {
        query = query.where('created_at', '<', new Date(cursor));
      }

      const rows = await query.execute();
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;

      res.json({
        notifications: items.map((n) => ({
          id: n.id,
          cooperativeDid: n.cooperative_did,
          title: n.title,
          body: n.body,
          category: n.category,
          sourceType: n.source_type,
          sourceId: n.source_id,
          read: n.read,
          createdAt:
            n.created_at instanceof Date
              ? n.created_at.toISOString()
              : n.created_at,
        })),
        cursor: hasMore
          ? items[items.length - 1]!.created_at instanceof Date
            ? (items[items.length - 1]!.created_at as Date).toISOString()
            : String(items[items.length - 1]!.created_at)
          : undefined,
      });
    }),
  );

  // GET /api/v1/notifications/unread-count — count unread notifications
  router.get(
    '/api/v1/notifications/unread-count',
    requireAuth,
    asyncHandler(async (req, res) => {
      const result = await container.db
        .selectFrom('notification')
        .where('recipient_did', '=', req.actor!.did)
        .where('read', '=', false)
        .select(container.db.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();

      res.json({ count: Number(result.count) });
    }),
  );

  // PUT /api/v1/notifications/:id/read — mark single as read
  router.put(
    '/api/v1/notifications/:id/read',
    requireAuth,
    asyncHandler(async (req, res) => {
      const [row] = await container.db
        .updateTable('notification')
        .set({ read: true })
        .where('id', '=', String(req.params.id))
        .where('recipient_did', '=', req.actor!.did)
        .returningAll()
        .execute();

      if (!row) throw new NotFoundError('Notification not found');

      res.json({ success: true });
    }),
  );

  // PUT /api/v1/notifications/read-all — mark all as read
  router.put(
    '/api/v1/notifications/read-all',
    requireAuth,
    asyncHandler(async (req, res) => {
      await container.db
        .updateTable('notification')
        .set({ read: true })
        .where('recipient_did', '=', req.actor!.did)
        .where('read', '=', false)
        .execute();

      res.json({ success: true });
    }),
  );

  return router;
}
