import { Router } from 'express';
import type { Selectable } from 'kysely';
import type { LegalDocumentTable } from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateLegalDocumentSchema,
  UpdateLegalDocumentSchema,
} from '@coopsource/common';

function formatDocument(row: Selectable<LegalDocumentTable>) {
  return {
    id: row.id,
    uri: row.uri,
    cooperativeDid: row.cooperative_did,
    authorDid: row.author_did,
    title: row.title,
    body: row.body,
    bodyFormat: row.body_format,
    documentType: row.document_type,
    version: row.version,
    previousVersionUri: row.previous_version_uri,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    indexedAt: row.indexed_at.toISOString(),
  };
}

export function createLegalDocumentRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/legal/documents — list
  router.get(
    '/api/v1/legal/documents',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const status = req.query.status ? String(req.query.status) : undefined;
      const documentType = req.query.documentType ? String(req.query.documentType) : undefined;

      const page = await container.legalDocumentService.list(
        req.actor!.cooperativeDid,
        { ...params, status, documentType },
      );

      res.json({
        documents: page.items.map(formatDocument),
        cursor: page.cursor ?? null,
      });
    }),
  );

  // POST /api/v1/legal/documents — create
  router.post(
    '/api/v1/legal/documents',
    requireAuth,
    requirePermission('legal.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateLegalDocumentSchema.parse(req.body);

      const doc = await container.legalDocumentService.create(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );

      res.status(201).json(formatDocument(doc));
    }),
  );

  // GET /api/v1/legal/documents/:id — get by id
  router.get(
    '/api/v1/legal/documents/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const doc = await container.legalDocumentService.getById(
        String(req.params.id),
      );

      res.json(formatDocument(doc));
    }),
  );

  // PUT /api/v1/legal/documents/:id — update (creates new version)
  router.put(
    '/api/v1/legal/documents/:id',
    requireAuth,
    requirePermission('legal.manage'),
    asyncHandler(async (req, res) => {
      const data = UpdateLegalDocumentSchema.parse(req.body);

      const doc = await container.legalDocumentService.update(
        String(req.params.id),
        req.actor!.did,
        req.actor!.cooperativeDid,
        data,
      );

      res.json(formatDocument(doc));
    }),
  );

  return router;
}
