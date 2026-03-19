import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { CollaborativeProjectTable, CollaborativeContributionTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateCollaborativeProjectSchema,
  UpdateCollaborativeProjectSchema,
  RecordContributionToProjectSchema,
} from '@coopsource/common';

function formatProject(row: Selectable<CollaborativeProjectTable>) {
  return {
    id: row.id,
    hostCooperativeDid: row.host_cooperative_did,
    title: row.title,
    description: row.description,
    status: row.status,
    participantDids: row.participant_dids,
    uri: row.uri,
    cid: row.cid,
    revenueSplit: row.revenue_split,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    indexedAt: row.indexed_at instanceof Date ? row.indexed_at.toISOString() : row.indexed_at,
  };
}

function formatContribution(row: Selectable<CollaborativeContributionTable>) {
  return {
    id: row.id,
    projectId: row.project_id,
    cooperativeDid: row.cooperative_did,
    hoursContributed: Number(row.hours_contributed),
    revenueEarned: Number(row.revenue_earned),
    expenseIncurred: Number(row.expense_incurred),
    periodStart: row.period_start instanceof Date ? row.period_start.toISOString() : row.period_start,
    periodEnd: row.period_end instanceof Date ? row.period_end.toISOString() : row.period_end,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    indexedAt: row.indexed_at instanceof Date ? row.indexed_at.toISOString() : row.indexed_at,
  };
}

export function createCollaborativeProjectRoutes(container: Container): Router {
  const router = Router();

  // Create project
  router.post(
    '/api/v1/commerce/projects',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateCollaborativeProjectSchema.parse(req.body);
      const project = await container.collaborativeProjectService.createProject(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.status(201).json(formatProject(project));
    }),
  );

  // List projects
  router.get(
    '/api/v1/commerce/projects',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const filters = {
        status: req.query.status ? String(req.query.status) : undefined,
      };
      const page = await container.collaborativeProjectService.listProjects(
        req.actor!.cooperativeDid,
        params,
        filters,
      );
      res.json({ projects: page.items.map(formatProject), cursor: page.cursor ?? null });
    }),
  );

  // Get project with contributions
  router.get(
    '/api/v1/commerce/projects/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const result = await container.collaborativeProjectService.getProject(
        String(req.params.id),
      );
      const { contributions, ...project } = result;
      res.json({
        ...formatProject(project),
        contributions: contributions.map(formatContribution),
      });
    }),
  );

  // Update project
  router.put(
    '/api/v1/commerce/projects/:id',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      const data = UpdateCollaborativeProjectSchema.parse(req.body);
      const project = await container.collaborativeProjectService.updateProject(
        String(req.params.id),
        req.actor!.cooperativeDid,
        data,
      );
      res.json(formatProject(project));
    }),
  );

  // Record contribution
  router.post(
    '/api/v1/commerce/projects/:id/contributions',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      const data = RecordContributionToProjectSchema.parse(req.body);
      const contribution = await container.collaborativeProjectService.recordContribution(
        String(req.params.id),
        data,
      );
      res.status(201).json(formatContribution(contribution));
    }),
  );

  // List contributions
  router.get(
    '/api/v1/commerce/projects/:id/contributions',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const page = await container.collaborativeProjectService.getContributions(
        String(req.params.id),
        params,
      );
      res.json({ contributions: page.items.map(formatContribution), cursor: page.cursor ?? null });
    }),
  );

  return router;
}
