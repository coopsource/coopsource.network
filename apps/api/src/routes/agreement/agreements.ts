import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { StakeholderTermsTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateMasterAgreementSchema,
  UpdateMasterAgreementSchema,
  CreateStakeholderTermsSchema,
  SignAgreementSchema,
  RetractSignatureSchema,
} from '@coopsource/common';
import {
  formatAgreement,
  type AgreementResponse,
} from '../../lib/formatters.js';

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

function formatStakeholderTerms(row: Selectable<StakeholderTermsTable>) {
  return {
    uri: row.uri,
    did: row.did,
    agreementUri: row.agreement_uri,
    stakeholderDid: row.stakeholder_did,
    stakeholderType: row.stakeholder_type,
    stakeholderClass: row.stakeholder_class,
    contributions: row.contributions,
    financialTerms: row.financial_terms,
    ipTerms: row.ip_terms,
    governanceRights: row.governance_rights,
    exitTerms: row.exit_terms,
    signedAt: row.signed_at
      ? row.signed_at.toISOString()
      : null,
    createdAt: row.created_at.toISOString(),
  };
}

export function createAgreementRoutes(container: Container): Router {
  const router = Router();

  // POST /api/v1/agreements — Create agreement
  router.post(
    '/api/v1/agreements',
    requireAuth,
    requirePermission('agreement.create'),
    asyncHandler(async (req, res) => {
      const data = CreateMasterAgreementSchema.parse(req.body);
      const body = typeof req.body.body === 'string' ? req.body.body : undefined;
      const bodyFormat = typeof req.body.bodyFormat === 'string' ? req.body.bodyFormat : undefined;

      const agreement = await container.agreementService.createAgreement(
        req.actor!.did,
        req.actor!.cooperativeDid,
        { ...data, body, bodyFormat },
      );

      res
        .status(201)
        .json(await enrichAgreement(container, agreement, req.actor!.did));
    }),
  );

  // GET /api/v1/agreements — List agreements
  router.get(
    '/api/v1/agreements',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const status = req.query.status ? String(req.query.status) : undefined;

      const page = await container.agreementService.listAgreements(
        req.actor!.cooperativeDid,
        { ...params, status },
      );

      const agreements = await Promise.all(
        page.items.map((row) =>
          enrichAgreement(container, row, req.actor!.did),
        ),
      );

      res.json({ agreements, cursor: page.cursor ?? null });
    }),
  );

  // GET /api/v1/agreements/:uri — Get single agreement
  router.get(
    '/api/v1/agreements/:uri',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const result = await container.agreementService.getAgreement(uri);
      res.json(await enrichAgreement(container, result, req.actor!.did));
    }),
  );

  // PUT /api/v1/agreements/:uri — Update agreement (draft only)
  router.put(
    '/api/v1/agreements/:uri',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const data = UpdateMasterAgreementSchema.parse(req.body);
      const body = typeof req.body.body === 'string' ? req.body.body : undefined;
      const bodyFormat = typeof req.body.bodyFormat === 'string' ? req.body.bodyFormat : undefined;

      const agreement = await container.agreementService.updateAgreement(
        uri,
        req.actor!.did,
        { ...data, body, bodyFormat },
      );

      res.json(await enrichAgreement(container, agreement, req.actor!.did));
    }),
  );

  // POST /api/v1/agreements/:uri/open — Open for signing (draft→open)
  router.post(
    '/api/v1/agreements/:uri/open',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const agreement = await container.agreementService.openAgreement(
        uri,
        req.actor!.did,
      );
      res.json(await enrichAgreement(container, agreement, req.actor!.did));
    }),
  );

  // POST /api/v1/agreements/:uri/activate — Activate (open→active or draft→active)
  router.post(
    '/api/v1/agreements/:uri/activate',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const agreement = await container.agreementService.activateAgreement(
        uri,
        req.actor!.did,
      );
      res.json(await enrichAgreement(container, agreement, req.actor!.did));
    }),
  );

  // POST /api/v1/agreements/:uri/terminate — Terminate (active→terminated)
  router.post(
    '/api/v1/agreements/:uri/terminate',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const agreement = await container.agreementService.terminateAgreement(
        uri,
        req.actor!.did,
      );
      res.json(await enrichAgreement(container, agreement, req.actor!.did));
    }),
  );

  // POST /api/v1/agreements/:uri/void — Void (any→voided)
  router.post(
    '/api/v1/agreements/:uri/void',
    requireAuth,
    requirePermission('agreement.amend'),
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const agreement = await container.agreementService.voidAgreement(
        uri,
        req.actor!.did,
      );
      res.json(await enrichAgreement(container, agreement, req.actor!.did));
    }),
  );

  // POST /api/v1/agreements/:uri/sign — Sign agreement
  router.post(
    '/api/v1/agreements/:uri/sign',
    requireAuth,
    requirePermission('agreement.sign'),
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const { statement } = SignAgreementSchema.parse(req.body);
      await container.agreementService.signAgreement(
        uri,
        req.actor!.did,
        statement,
      );
      const result = await container.agreementService.getAgreement(uri);
      res
        .status(201)
        .json(await enrichAgreement(container, result, req.actor!.did));
    }),
  );

  // DELETE /api/v1/agreements/:uri/sign — Retract signature
  router.delete(
    '/api/v1/agreements/:uri/sign',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const { reason } = RetractSignatureSchema.parse(req.body);
      await container.agreementService.retractSignature(
        uri,
        req.actor!.did,
        reason,
      );
      res.status(204).send();
    }),
  );

  // POST /api/v1/agreements/:uri/terms — Add stakeholder terms
  router.post(
    '/api/v1/agreements/:uri/terms',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const data = CreateStakeholderTermsSchema.parse(req.body);
      const terms = await container.agreementService.addStakeholderTerms(
        req.actor!.did,
        uri,
        data,
      );
      res.status(201).json(formatStakeholderTerms(terms));
    }),
  );

  // GET /api/v1/agreements/:uri/terms — List stakeholder terms
  router.get(
    '/api/v1/agreements/:uri/terms',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const terms = await container.agreementService.listStakeholderTerms(uri);
      res.json({
        terms: terms.map((t) =>
          formatStakeholderTerms(t),
        ),
      });
    }),
  );

  // DELETE /api/v1/agreements/:uri/terms/:termsUri — Remove stakeholder terms
  router.delete(
    '/api/v1/agreements/:uri/terms/:termsUri',
    requireAuth,
    asyncHandler(async (req, res) => {
      const termsUri = decodeURIComponent(String(req.params.termsUri));
      await container.agreementService.removeStakeholderTerms(
        termsUri,
        req.actor!.did,
      );
      res.status(204).send();
    }),
  );

  // GET /api/v1/agreements/:uri/history — Audit trail
  router.get(
    '/api/v1/agreements/:uri/history',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const revisions = await container.agreementService.getAgreementHistory(uri);
      res.json({
        revisions: revisions.map((r) => ({
          id: r.id,
          agreementUri: r.agreement_uri,
          revisionNumber: r.revision_number,
          changedBy: r.changed_by,
          changeType: r.change_type,
          fieldChanges: r.field_changes,
          snapshot: r.snapshot,
          createdAt: r.created_at.toISOString(),
        })),
      });
    }),
  );

  return router;
}
