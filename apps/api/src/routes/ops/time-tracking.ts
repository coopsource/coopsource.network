import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { TimeEntryTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateTimeEntrySchema,
  UpdateTimeEntrySchema,
  SubmitTimeEntriesSchema,
  ReviewTimeEntriesSchema,
} from '@coopsource/common';

function formatTimeEntry(row: Selectable<TimeEntryTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    memberDid: row.member_did,
    taskId: row.task_id,
    projectId: row.project_id,
    description: row.description,
    startedAt: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
    endedAt: row.ended_at instanceof Date ? row.ended_at.toISOString() : row.ended_at,
    durationMinutes: row.duration_minutes !== null ? Number(row.duration_minutes) : null,
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at instanceof Date ? row.approved_at.toISOString() : row.approved_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    indexedAt: row.indexed_at instanceof Date ? row.indexed_at.toISOString() : row.indexed_at,
  };
}

export function createTimeTrackingRoutes(container: Container): Router {
  const router = Router();

  // ── Create ─────────────────────────────────────────────────────────────

  router.post(
    '/api/v1/ops/time-entries',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = CreateTimeEntrySchema.parse(req.body);
      const entry = await container.timeTrackingService.createEntry(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.status(201).json(formatTimeEntry(entry));
    }),
  );

  // ── List ───────────────────────────────────────────────────────────────

  router.get(
    '/api/v1/ops/time-entries',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const filters = {
        memberDid: req.query.memberDid ? String(req.query.memberDid) : undefined,
        taskId: req.query.taskId ? String(req.query.taskId) : undefined,
        projectId: req.query.projectId ? String(req.query.projectId) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
      };
      const page = await container.timeTrackingService.listEntries(
        req.actor!.cooperativeDid,
        params,
        filters,
      );
      res.json({ entries: page.items.map(formatTimeEntry), cursor: page.cursor ?? null });
    }),
  );

  // ── Get ────────────────────────────────────────────────────────────────

  router.get(
    '/api/v1/ops/time-entries/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const entry = await container.timeTrackingService.getEntry(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.json(formatTimeEntry(entry));
    }),
  );

  // ── Update ─────────────────────────────────────────────────────────────

  router.put(
    '/api/v1/ops/time-entries/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = UpdateTimeEntrySchema.parse(req.body);
      const entry = await container.timeTrackingService.updateEntry(
        String(req.params.id),
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.json(formatTimeEntry(entry));
    }),
  );

  // ── Delete ─────────────────────────────────────────────────────────────

  router.delete(
    '/api/v1/ops/time-entries/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      await container.timeTrackingService.deleteEntry(
        String(req.params.id),
        req.actor!.cooperativeDid,
        req.actor!.did,
      );
      res.status(204).end();
    }),
  );

  // ── Batch Submit ───────────────────────────────────────────────────────

  router.post(
    '/api/v1/ops/time-entries/submit',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = SubmitTimeEntriesSchema.parse(req.body);
      const entries = await container.timeTrackingService.submitEntries(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data.entryIds,
      );
      res.json({ entries: entries.map(formatTimeEntry) });
    }),
  );

  // ── Batch Review ───────────────────────────────────────────────────────

  router.post(
    '/api/v1/ops/time-entries/review',
    requireAuth,
    requirePermission('ops.manage'),
    asyncHandler(async (req, res) => {
      const data = ReviewTimeEntriesSchema.parse(req.body);
      const entries = await container.timeTrackingService.reviewEntries(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data.entryIds,
        data.action,
      );
      res.json({ entries: entries.map(formatTimeEntry) });
    }),
  );

  // ── Member Summary ─────────────────────────────────────────────────────

  router.get(
    '/api/v1/ops/time-entries/summary/member/:memberDid',
    requireAuth,
    asyncHandler(async (req, res) => {
      const startDate = String(req.query.startDate ?? '');
      const endDate = String(req.query.endDate ?? '');
      if (!startDate || !endDate) {
        res.status(400).json({ error: 'VALIDATION', message: 'startDate and endDate are required' });
        return;
      }
      const summary = await container.timeTrackingService.getMemberSummary(
        req.actor!.cooperativeDid,
        String(req.params.memberDid),
        startDate,
        endDate,
      );
      res.json(summary);
    }),
  );

  // ── Project Summary ────────────────────────────────────────────────────

  router.get(
    '/api/v1/ops/time-entries/summary/project/:projectId',
    requireAuth,
    asyncHandler(async (req, res) => {
      const startDate = String(req.query.startDate ?? '');
      const endDate = String(req.query.endDate ?? '');
      if (!startDate || !endDate) {
        res.status(400).json({ error: 'VALIDATION', message: 'startDate and endDate are required' });
        return;
      }
      const summary = await container.timeTrackingService.getProjectSummary(
        req.actor!.cooperativeDid,
        String(req.params.projectId),
        startDate,
        endDate,
      );
      res.json({ members: summary });
    }),
  );

  return router;
}
