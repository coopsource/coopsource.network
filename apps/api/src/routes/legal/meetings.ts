import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { MeetingRecordTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import { CreateMeetingRecordSchema } from '@coopsource/common';

function formatMeeting(row: Selectable<MeetingRecordTable>) {
  return {
    id: row.id,
    uri: row.uri,
    cooperativeDid: row.cooperative_did,
    authorDid: row.author_did,
    title: row.title,
    meetingDate: row.meeting_date.toISOString(),
    meetingType: row.meeting_type,
    attendees: row.attendee_dids,
    quorumMet: row.quorum_met,
    resolutions: row.resolutions,
    minutes: row.minutes,
    certifiedBy: row.certified_by,
    createdAt: row.created_at.toISOString(),
  };
}

export function createMeetingRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/legal/meetings — list
  router.get(
    '/api/v1/legal/meetings',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const meetingType = req.query.meetingType ? String(req.query.meetingType) : undefined;

      const page = await container.meetingRecordService.list(
        req.actor!.cooperativeDid,
        { ...params, meetingType },
      );

      res.json({
        meetings: page.items.map(formatMeeting),
        cursor: page.cursor ?? null,
      });
    }),
  );

  // POST /api/v1/legal/meetings — create
  router.post(
    '/api/v1/legal/meetings',
    requireAuth,
    requirePermission('legal.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateMeetingRecordSchema.parse(req.body);

      const meeting = await container.meetingRecordService.create(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );

      res.status(201).json(formatMeeting(meeting));
    }),
  );

  // POST /api/v1/legal/meetings/:id/certify — certify
  router.post(
    '/api/v1/legal/meetings/:id/certify',
    requireAuth,
    requirePermission('legal.manage'),
    asyncHandler(async (req, res) => {
      const meeting = await container.meetingRecordService.certify(
        String(req.params.id),
        req.actor!.did,
      );

      res.json(formatMeeting(meeting));
    }),
  );

  return router;
}
