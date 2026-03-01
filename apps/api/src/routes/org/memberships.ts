import { Router } from 'express';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { BCRYPT_ROUNDS } from '../../lib/crypto-config.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import { formatInvitation } from '../../lib/formatters.js';
import {
  CreateInvitationSchema,
  AcceptInvitationSchema,
  UpdateRolesSchema,
} from '@coopsource/common';
import { validateDid } from '../../lib/validate-params.js';

export function createMembershipRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/members
  router.get(
    '/api/v1/members',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const result = await container.membershipService.listMembers(
        req.actor!.cooperativeDid,
        params,
      );

      // Batch-load handles and emails to avoid N+1 queries
      const dids = result.items.map((m) => m.did);

      const entities = dids.length > 0
        ? await container.db
            .selectFrom('entity')
            .where('did', 'in', dids)
            .select(['did', 'handle'])
            .execute()
        : [];
      const entityMap = new Map(entities.map((e) => [e.did, e]));

      const creds = dids.length > 0
        ? await container.db
            .selectFrom('auth_credential')
            .where('entity_did', 'in', dids)
            .where('credential_type', '=', 'password')
            .where('invalidated_at', 'is', null)
            .select(['entity_did', 'identifier'])
            .execute()
        : [];
      const credMap = new Map(creds.map((c) => [c.entity_did, c]));

      const members = result.items.map((member) => ({
        did: member.did,
        handle: entityMap.get(member.did)?.handle ?? null,
        displayName: member.displayName,
        email: credMap.get(member.did)?.identifier ?? null,
        roles: member.roles,
        status: member.status,
        joinedAt: member.joinedAt ? member.joinedAt.toISOString() : null,
      }));

      res.json({ members, cursor: result.cursor ?? null });
    }),
  );

  // GET /api/v1/members/:did
  router.get(
    '/api/v1/members/:did',
    requireAuth,
    asyncHandler(async (req, res) => {
      const member = await container.membershipService.getMember(
        req.actor!.cooperativeDid,
        validateDid(req.params.did),
      );
      if (!member) {
        res.status(404).json({
          error: 'NOT_FOUND', message: 'Member not found',
        });
        return;
      }

      const entity = await container.db
        .selectFrom('entity')
        .where('did', '=', member.did)
        .select('handle')
        .executeTakeFirst();

      const cred = await container.db
        .selectFrom('auth_credential')
        .where('entity_did', '=', member.did)
        .where('credential_type', '=', 'password')
        .where('invalidated_at', 'is', null)
        .select('identifier')
        .executeTakeFirst();

      res.json({
        did: member.did,
        handle: entity?.handle ?? null,
        displayName: member.displayName,
        email: cred?.identifier ?? null,
        roles: member.roles,
        status: member.status,
        joinedAt: member.joinedAt ? member.joinedAt.toISOString() : null,
      });
    }),
  );

  // PUT /api/v1/members/:did/roles
  router.put(
    '/api/v1/members/:did/roles',
    requireAuth,
    requirePermission('member.roles.assign'),
    asyncHandler(async (req, res) => {
      const { roles } = UpdateRolesSchema.parse(req.body);
      await container.membershipService.updateMemberRoles(
        req.actor!.cooperativeDid,
        validateDid(req.params.did),
        roles,
      );
      res.json({ ok: true });
    }),
  );

  // DELETE /api/v1/members/:did
  router.delete(
    '/api/v1/members/:did',
    requireAuth,
    requirePermission('member.remove'),
    asyncHandler(async (req, res) => {
      await container.membershipService.removeMember(
        req.actor!.cooperativeDid,
        validateDid(req.params.did),
      );
      res.status(204).send();
    }),
  );

  // ─── Invitations ────────────────────────────────────────────────────

  // GET /api/v1/invitations
  router.get(
    '/api/v1/invitations',
    requireAuth,
    requirePermission('member.invite'),
    asyncHandler(async (req, res) => {
      const rows = await container.db
        .selectFrom('invitation')
        .where('cooperative_did', '=', req.actor!.cooperativeDid)
        .where('invalidated_at', 'is', null)
        .selectAll()
        .orderBy('created_at', 'desc')
        .execute();

      // Batch-load inviter display names to avoid N+1 queries
      const inviterDids = [...new Set(rows.map((r) => r.invited_by_did))];
      const inviters = inviterDids.length > 0
        ? await container.db
            .selectFrom('entity')
            .where('did', 'in', inviterDids)
            .select(['did', 'display_name'])
            .execute()
        : [];
      const inviterMap = new Map(inviters.map((i) => [i.did, i.display_name]));

      const invitations = rows.map((row) =>
        formatInvitation(row, inviterMap.get(row.invited_by_did) ?? null),
      );

      res.json({ invitations, cursor: null });
    }),
  );

  // POST /api/v1/invitations
  router.post(
    '/api/v1/invitations',
    requireAuth,
    requirePermission('member.invite'),
    asyncHandler(async (req, res) => {
      const { email, roles, intendedRoles, message } = CreateInvitationSchema.parse(req.body);

      const invitation =
        await container.membershipService.createInvitation({
          cooperativeDid: req.actor!.cooperativeDid,
          invitedByDid: req.actor!.did,
          email,
          intendedRoles: roles ?? intendedRoles,
          message,
          instanceUrl: process.env.INSTANCE_URL ?? 'http://localhost:5173',
        });

      // Get inviter name for response
      const inviter = await container.db
        .selectFrom('entity')
        .where('did', '=', req.actor!.did)
        .select('display_name')
        .executeTakeFirst();

      res
        .status(201)
        .json(formatInvitation(invitation, inviter?.display_name ?? null));
    }),
  );

  // GET /api/v1/invitations/:token (public — shows invite details before accepting)
  router.get(
    '/api/v1/invitations/:token',
    asyncHandler(async (req, res) => {
      const inv = await container.db
        .selectFrom('invitation')
        .where('token', '=', (req.params.token as string))
        .where('invalidated_at', 'is', null)
        .selectAll()
        .executeTakeFirst();

      if (!inv) {
        res.status(404).json({ error: 'NotFound', message: 'Invitation not found' });
        return;
      }

      const coop = await container.db
        .selectFrom('entity')
        .where('did', '=', inv.cooperative_did)
        .select('display_name')
        .executeTakeFirst();

      res.json({
        id: inv.id,
        status: inv.status,
        email: inv.invitee_email ?? null,
        roles: inv.intended_roles ?? [],
        message: inv.message ?? null,
        expiresAt: inv.expires_at.toISOString(),
        cooperativeName: coop?.display_name ?? null,
      });
    }),
  );

  // POST /api/v1/invitations/:token/accept (public — creates account + membership)
  router.post(
    '/api/v1/invitations/:token/accept',
    asyncHandler(async (req, res) => {
      const { displayName, handle, password } = AcceptInvitationSchema.parse(req.body);

      // Validate invitation
      const inv = await container.db
        .selectFrom('invitation')
        .where('token', '=', (req.params.token as string))
        .where('status', '=', 'pending')
        .where('invalidated_at', 'is', null)
        .selectAll()
        .executeTakeFirst();

      if (!inv) {
        res.status(404).json({ error: 'NotFound', message: 'Invitation not found or already used' });
        return;
      }

      if (new Date(inv.expires_at) < container.clock.now()) {
        res.status(400).json({ error: 'ValidationError', message: 'Invitation has expired' });
        return;
      }

      const now = container.clock.now();
      const { hash } = await import('bcrypt');
      const secretHash = await hash(password, BCRYPT_ROUNDS);
      const roles = inv.intended_roles ?? ['member'];

      // Create DID and PDS records outside the transaction (non-DB operations)
      const memberDidDoc = await container.pdsService.createDid({
        entityType: 'person',
        pdsUrl: process.env.INSTANCE_URL ?? 'http://localhost:3001',
      });
      const memberDid = memberDidDoc.id;

      const memberRef = await container.pdsService.createRecord({
        did: memberDid as import('@coopsource/common').DID,
        collection: 'network.coopsource.org.membership',
        record: {
          cooperative: inv.cooperative_did,
          invitationUri: `at://invitation/${inv.id}`,
          createdAt: now.toISOString(),
        },
      });

      const approvalRef = await container.pdsService.createRecord({
        did: inv.cooperative_did as import('@coopsource/common').DID,
        collection: 'network.coopsource.org.memberApproval',
        record: {
          member: memberDid,
          roles,
          createdAt: now.toISOString(),
        },
      });

      // All DB writes wrapped in a transaction
      await container.db.transaction().execute(async (trx) => {
        // Create entity
        await trx
          .insertInto('entity')
          .values({
            did: memberDid,
            type: 'person',
            display_name: displayName,
            handle: handle ?? null,
            status: 'active',
            created_at: now,
            indexed_at: now,
          })
          .execute();

        // Create auth credential
        await trx
          .insertInto('auth_credential')
          .values({
            entity_did: memberDid,
            credential_type: 'password',
            identifier: inv.invitee_email ?? `${handle ?? memberDid}@${inv.cooperative_did}`,
            secret_hash: secretHash,
            created_at: now,
          })
          .execute();

        // Create membership row (with all PDS refs in one insert)
        const [membership] = await trx
          .insertInto('membership')
          .values({
            member_did: memberDid,
            cooperative_did: inv.cooperative_did,
            status: 'active',
            joined_at: now,
            member_record_uri: memberRef.uri,
            member_record_cid: memberRef.cid,
            approval_record_uri: approvalRef.uri,
            approval_record_cid: approvalRef.cid,
            created_at: now,
            indexed_at: now,
          })
          .returning('id')
          .execute();

        // Insert roles
        if (roles.length > 0) {
          await trx
            .insertInto('membership_role')
            .values(roles.map((role) => ({ membership_id: membership!.id, role, indexed_at: now })))
            .execute();
        }

        // Mark invitation accepted
        await trx
          .updateTable('invitation')
          .set({ status: 'accepted', invitee_did: memberDid })
          .where('id', '=', inv.id)
          .execute();
      });

      // Set session
      req.session.did = memberDid;

      res.status(201).json({
        member: {
          did: memberDid,
          handle: handle ?? null,
          displayName,
          email: inv.invitee_email ?? null,
          roles,
          status: 'active',
          joinedAt: now.toISOString(),
        },
      });
    }),
  );

  // DELETE /api/v1/invitations/:id
  router.delete(
    '/api/v1/invitations/:id',
    requireAuth,
    requirePermission('member.invite'),
    asyncHandler(async (req, res) => {
      await container.db
        .updateTable('invitation')
        .set({
          status: 'revoked',
          invalidated_at: new Date(),
          invalidated_by: req.actor!.did,
        })
        .where('id', '=', (req.params.id as string))
        .where('cooperative_did', '=', req.actor!.cooperativeDid)
        .execute();

      res.status(204).send();
    }),
  );

  return router;
}
