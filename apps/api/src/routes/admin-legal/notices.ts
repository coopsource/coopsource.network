import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { MemberNoticeTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import { CreateMemberNoticeSchema } from '@coopsource/common';

function formatNotice(row: Selectable<MemberNoticeTable>) {
  return {
    id: row.id,
    uri: row.uri,
    cooperativeDid: row.cooperative_did,
    authorDid: row.author_did,
    title: row.title,
    body: row.body,
    noticeType: row.notice_type,
    targetAudience: row.target_audience,
    sentAt: row.sent_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export function createNoticeRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/admin/notices — list
  router.get(
    '/api/v1/admin/notices',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);

      const page = await container.memberNoticeService.list(
        req.actor!.cooperativeDid,
        params,
      );

      res.json({
        notices: page.items.map(formatNotice),
        cursor: page.cursor ?? null,
      });
    }),
  );

  // POST /api/v1/admin/notices — create and send
  router.post(
    '/api/v1/admin/notices',
    requireAuth,
    requirePermission('legal.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateMemberNoticeSchema.parse(req.body);

      const notice = await container.memberNoticeService.create(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );

      res.status(201).json(formatNotice(notice));
    }),
  );

  return router;
}
