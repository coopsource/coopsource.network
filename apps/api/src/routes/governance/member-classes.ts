import { Router } from 'express';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import {
  CreateMemberClassSchema,
  UpdateMemberClassSchema,
  AssignMemberClassSchema,
} from '@coopsource/common';

function formatMemberClass(row: Record<string, unknown>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    name: row.name,
    description: row.description ?? null,
    voteWeight: row.vote_weight,
    quorumWeight: Number(row.quorum_weight),
    boardSeats: row.board_seats,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export function createMemberClassRoutes(container: Container): Router {
  const router = Router();

  // POST /api/v1/member-classes — Create a member class
  router.post(
    '/api/v1/member-classes',
    requireAuth,
    requirePermission('coop.settings.edit'),
    asyncHandler(async (req, res) => {
      const data = CreateMemberClassSchema.parse(req.body);
      const row = await container.memberClassService.createClass(
        req.actor!.cooperativeDid,
        data,
      );
      res.status(201).json(formatMemberClass(row as unknown as Record<string, unknown>));
    }),
  );

  // GET /api/v1/member-classes — List member classes
  router.get(
    '/api/v1/member-classes',
    requireAuth,
    asyncHandler(async (req, res) => {
      const rows = await container.memberClassService.listClasses(
        req.actor!.cooperativeDid,
      );
      res.json({
        classes: rows.map((r) => formatMemberClass(r as unknown as Record<string, unknown>)),
      });
    }),
  );

  // Static routes BEFORE parameterized /:id routes (Express first-match routing)

  // POST /api/v1/member-classes/assign — Assign a member to a class
  router.post(
    '/api/v1/member-classes/assign',
    requireAuth,
    requirePermission('member.roles.assign'),
    asyncHandler(async (req, res) => {
      const { memberDid, className } = AssignMemberClassSchema.parse(req.body);
      const membership = await container.memberClassService.assignMemberClass(
        req.actor!.cooperativeDid,
        memberDid,
        className,
      );
      res.json({
        memberDid: membership.member_did,
        className: membership.member_class,
      });
    }),
  );

  // DELETE /api/v1/member-classes/assign/:memberDid — Remove member from class
  router.delete(
    '/api/v1/member-classes/assign/:memberDid',
    requireAuth,
    requirePermission('member.roles.assign'),
    asyncHandler(async (req, res) => {
      const memberDid = decodeURIComponent(req.params.memberDid as string);
      await container.memberClassService.removeMemberClass(
        req.actor!.cooperativeDid,
        memberDid,
      );
      res.json({ memberDid, className: null });
    }),
  );

  // GET /api/v1/member-classes/:id — Get a member class
  router.get(
    '/api/v1/member-classes/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const row = await container.memberClassService.getClass(
        req.actor!.cooperativeDid,
        req.params.id as string,
      );
      res.json(formatMemberClass(row as unknown as Record<string, unknown>));
    }),
  );

  // PUT /api/v1/member-classes/:id — Update a member class
  router.put(
    '/api/v1/member-classes/:id',
    requireAuth,
    requirePermission('coop.settings.edit'),
    asyncHandler(async (req, res) => {
      const data = UpdateMemberClassSchema.parse(req.body);
      const row = await container.memberClassService.updateClass(
        req.actor!.cooperativeDid,
        req.params.id as string,
        data,
      );
      res.json(formatMemberClass(row as unknown as Record<string, unknown>));
    }),
  );

  // DELETE /api/v1/member-classes/:id — Delete a member class
  router.delete(
    '/api/v1/member-classes/:id',
    requireAuth,
    requirePermission('coop.settings.edit'),
    asyncHandler(async (req, res) => {
      await container.memberClassService.deleteClass(
        req.actor!.cooperativeDid,
        req.params.id as string,
      );
      res.status(204).send();
    }),
  );

  return router;
}
