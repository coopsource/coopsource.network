import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { ReportTemplateTable, ReportSnapshotTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateReportTemplateSchema,
  GenerateReportSchema,
} from '@coopsource/common';

function formatTemplate(row: Selectable<ReportTemplateTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    name: row.name,
    reportType: row.report_type,
    config: row.config,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function formatSnapshot(row: Selectable<ReportSnapshotTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    templateId: row.template_id,
    reportType: row.report_type,
    title: row.title,
    data: row.data,
    generatedBy: row.generated_by,
    generatedAt: row.generated_at instanceof Date ? row.generated_at.toISOString() : row.generated_at,
    periodStart: row.period_start instanceof Date ? row.period_start.toISOString() : row.period_start,
    periodEnd: row.period_end instanceof Date ? row.period_end.toISOString() : row.period_end,
  };
}

export function createReportRoutes(container: Container): Router {
  const router = Router();

  router.post(
    '/api/v1/reports/templates',
    requireAuth,
    requirePermission('reports.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateReportTemplateSchema.parse(req.body);
      const template = await container.reportingService.createTemplate(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.status(201).json(formatTemplate(template));
    }),
  );

  router.get(
    '/api/v1/reports/templates',
    requireAuth,
    asyncHandler(async (req, res) => {
      const templates = await container.reportingService.listTemplates(
        req.actor!.cooperativeDid,
      );
      res.json({ templates: templates.map(formatTemplate) });
    }),
  );

  router.delete(
    '/api/v1/reports/templates/:id',
    requireAuth,
    requirePermission('reports.manage'),
    asyncHandler(async (req, res) => {
      await container.reportingService.deleteTemplate(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.status(204).end();
    }),
  );

  router.post(
    '/api/v1/reports/generate',
    requireAuth,
    requirePermission('reports.manage'),
    asyncHandler(async (req, res) => {
      const data = GenerateReportSchema.parse(req.body);
      const report = await container.reportingService.generateReport(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.status(201).json(formatSnapshot(report));
    }),
  );

  router.get(
    '/api/v1/reports',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const reportType = req.query.reportType ? String(req.query.reportType) : undefined;
      const page = await container.reportingService.listReports(
        req.actor!.cooperativeDid,
        params,
        reportType ? { reportType } : undefined,
      );
      res.json({ reports: page.items.map(formatSnapshot), cursor: page.cursor ?? null });
    }),
  );

  router.get(
    '/api/v1/reports/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const report = await container.reportingService.getReport(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.json(formatSnapshot(report));
    }),
  );

  return router;
}
