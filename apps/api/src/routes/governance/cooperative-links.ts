import { Router } from 'express';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateCooperativeLinkSchema,
  RespondToLinkSchema,
} from '@coopsource/common';

function formatLink(row: Record<string, unknown>) {
  return {
    id: row.id,
    initiatorDid: row.initiator_did,
    targetDid: row.target_did,
    linkType: row.link_type,
    status: row.status,
    description: row.description ?? null,
    metadata: row.metadata ?? null,
    initiatedAt: row.initiated_at ? (row.initiated_at as Date).toISOString() : null,
    respondedAt: row.responded_at ? (row.responded_at as Date).toISOString() : null,
    dissolvedAt: row.dissolved_at ? (row.dissolved_at as Date).toISOString() : null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

export function createCooperativeLinkRoutes(container: Container): Router {
  const router = Router();

  // POST /api/v1/cooperative-links — Create a link
  router.post(
    '/api/v1/cooperative-links',
    requireAuth,
    requirePermission('coop.links.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateCooperativeLinkSchema.parse(req.body);
      const row = await container.cooperativeLinkService.createLink(
        req.actor!.cooperativeDid,
        data,
      );
      res.status(201).json(formatLink(row as unknown as Record<string, unknown>));
    }),
  );

  // GET /api/v1/cooperative-links — List links for cooperative
  router.get(
    '/api/v1/cooperative-links',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const status = req.query.status ? String(req.query.status) : undefined;
      const linkType = req.query.linkType ? String(req.query.linkType) : undefined;
      const result = await container.cooperativeLinkService.listLinks(
        req.actor!.cooperativeDid,
        { ...params, status, linkType },
      );
      res.json({
        links: result.items.map(formatLink),
        cursor: result.cursor ?? null,
      });
    }),
  );

  // GET /api/v1/cooperative-links/partners — List linked cooperatives with details
  router.get(
    '/api/v1/cooperative-links/partners',
    requireAuth,
    asyncHandler(async (req, res) => {
      const partners = await container.cooperativeLinkService.listLinkedCooperatives(
        req.actor!.cooperativeDid,
      );
      res.json({ partners });
    }),
  );

  // GET /api/v1/cooperative-links/:id — Get a link
  router.get(
    '/api/v1/cooperative-links/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const row = await container.cooperativeLinkService.getLink(
        req.params.id as string,
      );
      // Only participating cooperatives can view the link
      if (
        row.initiator_did !== req.actor!.cooperativeDid &&
        row.target_did !== req.actor!.cooperativeDid
      ) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Not a participant in this link' });
        return;
      }
      res.json(formatLink(row as unknown as Record<string, unknown>));
    }),
  );

  // POST /api/v1/cooperative-links/:id/respond — Accept or decline link
  router.post(
    '/api/v1/cooperative-links/:id/respond',
    requireAuth,
    requirePermission('coop.links.manage'),
    asyncHandler(async (req, res) => {
      const { accept, message } = RespondToLinkSchema.parse(req.body);
      const row = await container.cooperativeLinkService.respondToLink(
        req.params.id as string,
        req.actor!.cooperativeDid,
        accept,
        message,
      );
      res.json(formatLink(row as unknown as Record<string, unknown>));
    }),
  );

  // DELETE /api/v1/cooperative-links/:id — Dissolve link
  router.delete(
    '/api/v1/cooperative-links/:id',
    requireAuth,
    requirePermission('coop.links.manage'),
    asyncHandler(async (req, res) => {
      const row = await container.cooperativeLinkService.dissolveLink(
        req.params.id as string,
        req.actor!.cooperativeDid,
      );
      res.json(formatLink(row as unknown as Record<string, unknown>));
    }),
  );

  return router;
}
