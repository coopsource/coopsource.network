import { Router } from 'express';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateMasterAgreementSchema,
  UpdateMasterAgreementSchema,
  CreateStakeholderTermsSchema,
} from '@coopsource/common';

export function createMasterAgreementRoutes(container: Container): Router {
  const router = Router();

  // POST /api/v1/master-agreements — Create master agreement
  router.post(
    '/api/v1/master-agreements',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = CreateMasterAgreementSchema.parse(req.body);

      const agreement = await container.masterAgreementService.createMasterAgreement(
        req.actor!.did,
        req.actor!.cooperativeDid,
        data,
      );

      res.status(201).json(formatMasterAgreement(agreement));
    }),
  );

  // GET /api/v1/master-agreements — List master agreements
  router.get(
    '/api/v1/master-agreements',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query);
      const status = req.query.status ? String(req.query.status) : undefined;

      const page = await container.masterAgreementService.listMasterAgreements(
        req.actor!.cooperativeDid,
        { ...params, status },
      );

      res.json({
        masterAgreements: page.items.map(formatMasterAgreement),
        cursor: page.cursor,
      });
    }),
  );

  // GET /api/v1/master-agreements/:uri — Get single master agreement
  router.get(
    '/api/v1/master-agreements/:uri',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const agreement = await container.masterAgreementService.getMasterAgreement(uri);
      res.json(formatMasterAgreement(agreement));
    }),
  );

  // PUT /api/v1/master-agreements/:uri — Update master agreement (draft only)
  router.put(
    '/api/v1/master-agreements/:uri',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const data = UpdateMasterAgreementSchema.parse(req.body);

      const agreement = await container.masterAgreementService.updateMasterAgreement(
        uri,
        req.actor!.cooperativeDid,
        data,
      );

      res.json(formatMasterAgreement(agreement));
    }),
  );

  // POST /api/v1/master-agreements/:uri/activate — Activate (draft→active)
  router.post(
    '/api/v1/master-agreements/:uri/activate',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));

      const agreement = await container.masterAgreementService.updateMasterAgreementStatus(
        uri,
        req.actor!.cooperativeDid,
        'active',
      );

      res.json(formatMasterAgreement(agreement));
    }),
  );

  // POST /api/v1/master-agreements/:uri/terminate — Terminate (active→terminated)
  router.post(
    '/api/v1/master-agreements/:uri/terminate',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));

      const agreement = await container.masterAgreementService.updateMasterAgreementStatus(
        uri,
        req.actor!.cooperativeDid,
        'terminated',
      );

      res.json(formatMasterAgreement(agreement));
    }),
  );

  // POST /api/v1/master-agreements/:uri/terms — Add stakeholder terms
  router.post(
    '/api/v1/master-agreements/:uri/terms',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const data = CreateStakeholderTermsSchema.parse(req.body);

      const terms = await container.masterAgreementService.addStakeholderTerms(
        req.actor!.did,
        uri,
        data,
      );

      res.status(201).json(formatStakeholderTerms(terms));
    }),
  );

  // GET /api/v1/master-agreements/:uri/terms — List stakeholder terms
  router.get(
    '/api/v1/master-agreements/:uri/terms',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const terms = await container.masterAgreementService.listStakeholderTerms(uri);
      res.json({ terms: terms.map(formatStakeholderTerms) });
    }),
  );

  // DELETE /api/v1/master-agreements/:uri/terms/:termsUri — Remove stakeholder terms
  router.delete(
    '/api/v1/master-agreements/:uri/terms/:termsUri',
    requireAuth,
    asyncHandler(async (req, res) => {
      const termsUri = decodeURIComponent(String(req.params.termsUri));

      await container.masterAgreementService.removeStakeholderTerms(
        termsUri,
        req.actor!.did,
      );

      res.status(204).send();
    }),
  );

  return router;
}

function formatMasterAgreement(row: Record<string, unknown>) {
  return {
    uri: row.uri,
    did: row.did,
    projectUri: row.project_uri,
    title: row.title,
    version: row.version,
    purpose: row.purpose,
    scope: row.scope,
    agreementType: row.agreement_type,
    governanceFramework: row.governance_framework,
    disputeResolution: row.dispute_resolution,
    amendmentProcess: row.amendment_process,
    terminationConditions: row.termination_conditions,
    status: row.status,
    effectiveDate: row.effective_date
      ? (row.effective_date as Date).toISOString()
      : null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

function formatStakeholderTerms(row: Record<string, unknown>) {
  return {
    uri: row.uri,
    did: row.did,
    masterAgreementUri: row.master_agreement_uri,
    stakeholderDid: row.stakeholder_did,
    stakeholderType: row.stakeholder_type,
    stakeholderClass: row.stakeholder_class,
    contributions: row.contributions,
    financialTerms: row.financial_terms,
    ipTerms: row.ip_terms,
    governanceRights: row.governance_rights,
    exitTerms: row.exit_terms,
    signedAt: row.signed_at
      ? (row.signed_at as Date).toISOString()
      : null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}
