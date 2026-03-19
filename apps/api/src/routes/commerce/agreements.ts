import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { IntercoopAgreementTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateIntercoopAgreementSchema,
  UpdateIntercoopAgreementSchema,
} from '@coopsource/common';

function formatAgreement(row: Selectable<IntercoopAgreementTable>) {
  return {
    id: row.id,
    initiatorDid: row.initiator_did,
    responderDid: row.responder_did,
    title: row.title,
    description: row.description,
    agreementType: row.agreement_type,
    initiatorUri: row.initiator_uri,
    initiatorCid: row.initiator_cid,
    responderUri: row.responder_uri,
    responderCid: row.responder_cid,
    status: row.status,
    terms: row.terms,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    indexedAt: row.indexed_at instanceof Date ? row.indexed_at.toISOString() : row.indexed_at,
  };
}

export function createIntercoopAgreementRoutes(container: Container): Router {
  const router = Router();

  // Create inter-cooperative agreement
  router.post(
    '/api/v1/commerce/agreements',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateIntercoopAgreementSchema.parse(req.body);
      const agreement = await container.intercoopAgreementService.createAgreement(
        req.actor!.cooperativeDid,
        data,
      );
      res.status(201).json(formatAgreement(agreement));
    }),
  );

  // List agreements
  router.get(
    '/api/v1/commerce/agreements',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const filters = {
        status: req.query.status ? String(req.query.status) : undefined,
        partnerDid: req.query.partnerDid ? String(req.query.partnerDid) : undefined,
      };
      const page = await container.intercoopAgreementService.listAgreements(
        req.actor!.cooperativeDid,
        params,
        filters,
      );
      res.json({ agreements: page.items.map(formatAgreement), cursor: page.cursor ?? null });
    }),
  );

  // Get agreement
  router.get(
    '/api/v1/commerce/agreements/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const agreement = await container.intercoopAgreementService.getAgreement(
        String(req.params.id),
      );
      res.json(formatAgreement(agreement));
    }),
  );

  // Update agreement
  router.put(
    '/api/v1/commerce/agreements/:id',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      const data = UpdateIntercoopAgreementSchema.parse(req.body);
      const agreement = await container.intercoopAgreementService.updateAgreement(
        String(req.params.id),
        req.actor!.cooperativeDid,
        data,
      );
      res.json(formatAgreement(agreement));
    }),
  );

  // Respond to agreement (accept/reject)
  router.post(
    '/api/v1/commerce/agreements/:id/respond',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      const { accept } = req.body as { accept: boolean };
      const agreement = await container.intercoopAgreementService.respondToAgreement(
        String(req.params.id),
        req.actor!.cooperativeDid,
        Boolean(accept),
      );
      res.json(formatAgreement(agreement));
    }),
  );

  // Complete agreement
  router.post(
    '/api/v1/commerce/agreements/:id/complete',
    requireAuth,
    requirePermission('commerce.manage'),
    asyncHandler(async (req, res) => {
      const agreement = await container.intercoopAgreementService.completeAgreement(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.json(formatAgreement(agreement));
    }),
  );

  return router;
}
