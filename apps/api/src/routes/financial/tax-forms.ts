import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { TaxForm1099PatrTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';

function formatForm(row: Selectable<TaxForm1099PatrTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    fiscalPeriodId: row.fiscal_period_id,
    memberDid: row.member_did,
    taxYear: row.tax_year,
    patronageDividends: Number(row.patronage_dividends),
    perUnitRetainAllocated: Number(row.per_unit_retain_allocated),
    qualifiedPayments: Number(row.qualified_payments),
    cashPaid: Number(row.cash_paid),
    cashDeadline: row.cash_deadline instanceof Date ? row.cash_deadline.toISOString() : row.cash_deadline,
    cashPaidAt: row.cash_paid_at instanceof Date ? row.cash_paid_at.toISOString() : row.cash_paid_at,
    generationStatus: row.generation_status,
    generatedAt: row.generated_at instanceof Date ? row.generated_at.toISOString() : row.generated_at,
    sentAt: row.sent_at instanceof Date ? row.sent_at.toISOString() : row.sent_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export function createTaxFormRoutes(container: Container): Router {
  const router = Router();

  router.post(
    '/api/v1/financial/tax-forms/1099-patr/generate',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const { fiscalPeriodId, taxYear } = req.body as { fiscalPeriodId: string; taxYear: number };
      if (!fiscalPeriodId || !taxYear) {
        res.status(400).json({ error: 'VALIDATION', message: 'fiscalPeriodId and taxYear are required' });
        return;
      }
      const forms = await container.tax1099Service.generateForPeriod(
        req.actor!.cooperativeDid,
        fiscalPeriodId,
        taxYear,
      );
      res.status(201).json({ forms: forms.map(formatForm) });
    }),
  );

  router.get(
    '/api/v1/financial/tax-forms/1099-patr',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const taxYear = req.query.taxYear ? Number(req.query.taxYear) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const page = await container.tax1099Service.listForms(
        req.actor!.cooperativeDid,
        { ...params, taxYear, status },
      );
      res.json({ forms: page.items.map(formatForm), cursor: page.cursor ?? null });
    }),
  );

  router.get(
    '/api/v1/financial/tax-forms/1099-patr/deadlines',
    requireAuth,
    asyncHandler(async (req, res) => {
      const forms = await container.tax1099Service.getUpcomingDeadlines(
        req.actor!.cooperativeDid,
      );
      res.json({ forms: forms.map(formatForm) });
    }),
  );

  router.get(
    '/api/v1/financial/tax-forms/1099-patr/:id',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const form = await container.tax1099Service.getForm(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.json(formatForm(form));
    }),
  );

  router.post(
    '/api/v1/financial/tax-forms/1099-patr/:id/mark-generated',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const form = await container.tax1099Service.markGenerated(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.json(formatForm(form));
    }),
  );

  router.post(
    '/api/v1/financial/tax-forms/1099-patr/:id/mark-sent',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const form = await container.tax1099Service.markSent(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.json(formatForm(form));
    }),
  );

  router.post(
    '/api/v1/financial/tax-forms/1099-patr/:id/record-payment',
    requireAuth,
    requirePermission('financial.manage'),
    asyncHandler(async (req, res) => {
      const form = await container.tax1099Service.recordCashPayment(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.json(formatForm(form));
    }),
  );

  return router;
}
