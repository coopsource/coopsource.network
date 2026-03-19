import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { TaskTable, TaskLabelTable, TaskChecklistItemTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  CreateTaskLabelSchema,
  CreateChecklistItemSchema,
  UpdateChecklistItemSchema,
} from '@coopsource/common';

function formatTask(row: Selectable<TaskTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assigneeDids: row.assignee_dids,
    dueDate: row.due_date instanceof Date ? row.due_date.toISOString() : row.due_date,
    labels: row.labels,
    linkedProposalId: row.linked_proposal_id,
    uri: row.uri,
    cid: row.cid,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    indexedAt: row.indexed_at instanceof Date ? row.indexed_at.toISOString() : row.indexed_at,
  };
}

function formatLabel(row: Selectable<TaskLabelTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    name: row.name,
    color: row.color,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function formatChecklistItem(row: Selectable<TaskChecklistItemTable>) {
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    completed: row.completed,
    sortOrder: row.sort_order,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export function createTaskRoutes(container: Container): Router {
  const router = Router();

  // ── Tasks ──────────────────────────────────────────────────────────────

  router.post(
    '/api/v1/ops/tasks',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = CreateTaskSchema.parse(req.body);
      const result = await container.taskService.createTask(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      const { checklist_items, ...task } = result;
      res.status(201).json({
        ...formatTask(task as Selectable<TaskTable>),
        checklist: checklist_items.map(formatChecklistItem),
      });
    }),
  );

  router.get(
    '/api/v1/ops/tasks',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const filters = {
        status: req.query.status ? String(req.query.status) : undefined,
        priority: req.query.priority ? String(req.query.priority) : undefined,
        projectId: req.query.projectId ? String(req.query.projectId) : undefined,
        assigneeDid: req.query.assigneeDid ? String(req.query.assigneeDid) : undefined,
      };
      const page = await container.taskService.listTasks(
        req.actor!.cooperativeDid,
        params,
        filters,
      );
      res.json({ tasks: page.items.map(formatTask), cursor: page.cursor ?? null });
    }),
  );

  router.get(
    '/api/v1/ops/tasks/assignee/:memberDid',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const page = await container.taskService.getTasksByAssignee(
        req.actor!.cooperativeDid,
        String(req.params.memberDid),
        params,
      );
      res.json({ tasks: page.items.map(formatTask), cursor: page.cursor ?? null });
    }),
  );

  router.get(
    '/api/v1/ops/tasks/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const result = await container.taskService.getTask(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      const { checklist_items, ...task } = result;
      res.json({
        ...formatTask(task as Selectable<TaskTable>),
        checklist: checklist_items.map(formatChecklistItem),
      });
    }),
  );

  router.put(
    '/api/v1/ops/tasks/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = UpdateTaskSchema.parse(req.body);
      const task = await container.taskService.updateTask(
        String(req.params.id),
        req.actor!.cooperativeDid,
        data,
      );
      res.json(formatTask(task));
    }),
  );

  router.delete(
    '/api/v1/ops/tasks/:id',
    requireAuth,
    requirePermission('ops.manage'),
    asyncHandler(async (req, res) => {
      await container.taskService.deleteTask(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.status(204).end();
    }),
  );

  // ── Checklist Items ────────────────────────────────────────────────────

  router.post(
    '/api/v1/ops/tasks/:taskId/checklist',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = CreateChecklistItemSchema.parse(req.body);
      const item = await container.taskService.addChecklistItem(
        String(req.params.taskId),
        req.actor!.cooperativeDid,
        data,
      );
      res.status(201).json(formatChecklistItem(item));
    }),
  );

  router.put(
    '/api/v1/ops/tasks/checklist/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = UpdateChecklistItemSchema.parse(req.body);
      const item = await container.taskService.updateChecklistItem(
        String(req.params.id),
        data,
      );
      res.json(formatChecklistItem(item));
    }),
  );

  router.delete(
    '/api/v1/ops/tasks/checklist/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      await container.taskService.deleteChecklistItem(
        String(req.params.id),
      );
      res.status(204).end();
    }),
  );

  // ── Labels ─────────────────────────────────────────────────────────────

  router.post(
    '/api/v1/ops/labels',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = CreateTaskLabelSchema.parse(req.body);
      const label = await container.taskService.createLabel(
        req.actor!.cooperativeDid,
        data,
      );
      res.status(201).json(formatLabel(label));
    }),
  );

  router.get(
    '/api/v1/ops/labels',
    requireAuth,
    asyncHandler(async (req, res) => {
      const labels = await container.taskService.listLabels(
        req.actor!.cooperativeDid,
      );
      res.json({ labels: labels.map(formatLabel) });
    }),
  );

  router.delete(
    '/api/v1/ops/labels/:id',
    requireAuth,
    requirePermission('ops.manage'),
    asyncHandler(async (req, res) => {
      await container.taskService.deleteLabel(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.status(204).end();
    }),
  );

  return router;
}
