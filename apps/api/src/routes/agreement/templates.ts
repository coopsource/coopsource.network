import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { AgreementTemplateTable, AgreementTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateAgreementTemplateSchema,
  UpdateAgreementTemplateSchema,
} from '@coopsource/common';
import {
  formatAgreement,
  type AgreementResponse,
} from '../../lib/formatters.js';

function formatTemplate(row: Selectable<AgreementTemplateTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    createdBy: row.created_by,
    name: row.name,
    description: row.description,
    agreementType: row.agreement_type,
    templateData: row.template_data,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function enrichAgreement(
  container: Container,
  row: Parameters<typeof formatAgreement>[0],
  currentDid: string,
): Promise<AgreementResponse> {
  const author = await container.db
    .selectFrom('entity')
    .where('did', '=', row.created_by)
    .select(['display_name', 'handle'])
    .executeTakeFirst();

  const sigCount = await container.db
    .selectFrom('agreement_signature')
    .where('agreement_uri', '=', row.uri)
    .where('retracted_at', 'is', null)
    .select((eb) => [eb.fn.count<string>('id').as('count')])
    .executeTakeFirst();

  const mySig = await container.db
    .selectFrom('agreement_signature')
    .where('agreement_uri', '=', row.uri)
    .where('signer_did', '=', currentDid)
    .where('retracted_at', 'is', null)
    .select('id')
    .executeTakeFirst();

  return formatAgreement(row, {
    displayName: author?.display_name,
    handle: author?.handle,
    signatureCount: Number(sigCount?.count ?? 0),
    mySignature: !!mySig,
  });
}

export function createAgreementTemplateRoutes(container: Container): Router {
  const router = Router();

  // POST /api/v1/agreement-templates — Create template
  router.post(
    '/api/v1/agreement-templates',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = CreateAgreementTemplateSchema.parse(req.body);

      const template = await container.agreementTemplateService.createTemplate(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );

      res.status(201).json(formatTemplate(template));
    }),
  );

  // GET /api/v1/agreement-templates — List templates
  router.get(
    '/api/v1/agreement-templates',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);

      const page = await container.agreementTemplateService.listTemplates(
        req.actor!.cooperativeDid,
        params,
      );

      const templates = page.items.map((row) =>
        formatTemplate(row),
      );

      res.json({ templates, cursor: page.cursor ?? null });
    }),
  );

  // GET /api/v1/agreement-templates/:id — Get single template
  router.get(
    '/api/v1/agreement-templates/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const template = await container.agreementTemplateService.getTemplate(id);

      res.json(formatTemplate(template));
    }),
  );

  // PUT /api/v1/agreement-templates/:id — Update template
  router.put(
    '/api/v1/agreement-templates/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const data = UpdateAgreementTemplateSchema.parse(req.body);

      const template = await container.agreementTemplateService.updateTemplate(
        id,
        data,
      );

      res.json(formatTemplate(template));
    }),
  );

  // DELETE /api/v1/agreement-templates/:id — Delete template
  router.delete(
    '/api/v1/agreement-templates/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      await container.agreementTemplateService.deleteTemplate(id);
      res.status(204).send();
    }),
  );

  // POST /api/v1/agreement-templates/:id/use — Create agreement from template
  router.post(
    '/api/v1/agreement-templates/:id/use',
    requireAuth,
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const agreement = await container.agreementTemplateService.useTemplate(
        id,
        req.actor!.did,
        req.actor!.cooperativeDid,
        container.agreementService,
      );

      const enriched = await enrichAgreement(
        container,
        agreement as Selectable<AgreementTable>,
        req.actor!.did,
      );

      res.status(201).json(enriched);
    }),
  );

  return router;
}
