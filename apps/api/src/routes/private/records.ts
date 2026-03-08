import { Router } from 'express';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreatePrivateRecordSchema,
  UpdatePrivateRecordSchema,
} from '@coopsource/common';
import type { Selectable } from 'kysely';
import type { PrivateRecordTable } from '@coopsource/db';

function formatRecord(row: Selectable<PrivateRecordTable>) {
  return {
    did: row.did,
    collection: row.collection,
    rkey: row.rkey,
    record: row.record,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

export function createPrivateRecordRoutes(container: Container): Router {
  const router = Router();

  // POST /api/v1/private/records — create
  router.post(
    '/api/v1/private/records',
    requireAuth,
    requirePermission('private.manage'),
    asyncHandler(async (req, res) => {
      const data = CreatePrivateRecordSchema.parse(req.body);

      const record = await container.privateRecordService.create(
        req.actor!.cooperativeDid,
        data.collection,
        data.record,
        req.actor!.did,
        data.rkey,
      );

      res.status(201).json(formatRecord(record));
    }),
  );

  // GET /api/v1/private/records — list
  router.get(
    '/api/v1/private/records',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const collection = req.query.collection
        ? String(req.query.collection)
        : undefined;

      const page = await container.privateRecordService.list(
        req.actor!.cooperativeDid,
        { ...params, collection },
      );

      res.json({
        records: page.items.map(formatRecord),
        cursor: page.cursor ?? null,
      });
    }),
  );

  // GET /api/v1/private/records/:collection/:rkey — get single
  router.get(
    '/api/v1/private/records/:collection/:rkey',
    requireAuth,
    asyncHandler(async (req, res) => {
      const record = await container.privateRecordService.get(
        req.actor!.cooperativeDid,
        String(req.params.collection),
        String(req.params.rkey),
      );

      res.json(formatRecord(record));
    }),
  );

  // PUT /api/v1/private/records/:collection/:rkey — update
  router.put(
    '/api/v1/private/records/:collection/:rkey',
    requireAuth,
    requirePermission('private.manage'),
    asyncHandler(async (req, res) => {
      const data = UpdatePrivateRecordSchema.parse(req.body);

      const record = await container.privateRecordService.update(
        req.actor!.cooperativeDid,
        String(req.params.collection),
        String(req.params.rkey),
        data.record,
      );

      res.json(formatRecord(record));
    }),
  );

  // DELETE /api/v1/private/records/:collection/:rkey — delete
  router.delete(
    '/api/v1/private/records/:collection/:rkey',
    requireAuth,
    requirePermission('private.manage'),
    asyncHandler(async (req, res) => {
      await container.privateRecordService.delete(
        req.actor!.cooperativeDid,
        String(req.params.collection),
        String(req.params.rkey),
      );

      res.status(204).end();
    }),
  );

  return router;
}
