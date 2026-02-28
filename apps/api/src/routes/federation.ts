import { Router } from 'express';
import { z } from 'zod';
import type { DID } from '@coopsource/common';
import { NotFoundError } from '@coopsource/common';
import type { Container } from '../container.js';
import type { DidWebResolver } from '@coopsource/federation/http';
import type { AppConfig } from '../config.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireFederationAuth } from '../middleware/federation-auth.js';

// ── Zod schemas for request validation ──

const MembershipRequestSchema = z.object({
  memberDid: z.string().min(1),
  cooperativeDid: z.string().min(1),
  message: z.string().optional(),
});

const MembershipApproveSchema = z.object({
  cooperativeDid: z.string().min(1),
  memberDid: z.string().min(1),
  roles: z.array(z.string()),
});

const HubRegisterSchema = z.object({
  cooperativeDid: z.string().min(1),
  hubUrl: z.string().min(1),
  metadata: z.object({
    displayName: z.string().min(1),
    description: z.string().optional(),
    cooperativeType: z.string().optional(),
    website: z.string().optional(),
  }),
});

const HubNotifySchema = z.object({
  type: z.string().min(1),
  sourceDid: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  timestamp: z.string().min(1),
});

const AgreementSignRequestSchema = z.object({
  agreementUri: z.string().min(1),
  signerDid: z.string().min(1),
  cooperativeDid: z.string().min(1),
});

/**
 * Federation API endpoints — the "receiving side" of server-to-server calls.
 *
 * These endpoints process incoming federation requests locally. They call
 * container.pdsService directly (NOT container.federationClient) to avoid
 * infinite recursion — the receiving instance always processes locally.
 *
 * Public GET endpoints require no authentication.
 * Signed POST endpoints require HTTP Message Signature verification.
 */
export function createFederationRoutes(
  container: Container,
  didResolver: DidWebResolver,
  config: AppConfig,
): Router {
  const router = Router();
  const fedAuth = requireFederationAuth(didResolver);

  // ── Public GET endpoints (no signature verification) ──

  router.get(
    '/api/v1/federation/entity/:did',
    asyncHandler(async (req, res) => {
      const did = decodeURIComponent(req.params.did as string);

      const entity = await container.db
        .selectFrom('entity')
        .where('did', '=', did)
        .where('invalidated_at', 'is', null)
        .select([
          'did',
          'handle',
          'display_name',
          'type',
          'status',
          'description',
        ])
        .executeTakeFirst();

      if (!entity) {
        throw new NotFoundError(`Entity not found: ${did}`);
      }

      res.json({
        did: entity.did,
        handle: entity.handle,
        displayName: entity.display_name,
        type: entity.type,
        status: entity.status,
        description: entity.description,
      });
    }),
  );

  router.get(
    '/api/v1/federation/coop/:did/profile',
    asyncHandler(async (req, res) => {
      const did = decodeURIComponent(req.params.did as string);

      const row = await container.db
        .selectFrom('entity')
        .innerJoin(
          'cooperative_profile',
          'cooperative_profile.entity_did',
          'entity.did',
        )
        .where('entity.did', '=', did)
        .where('entity.invalidated_at', 'is', null)
        .select([
          'entity.did',
          'entity.handle',
          'entity.display_name',
          'entity.description',
          'cooperative_profile.cooperative_type',
          'cooperative_profile.membership_policy',
          'cooperative_profile.website',
        ])
        .executeTakeFirst();

      if (!row) {
        throw new NotFoundError(`Co-op profile not found: ${did}`);
      }

      const countResult = await container.db
        .selectFrom('membership')
        .where('cooperative_did', '=', did)
        .where('status', '=', 'active')
        .where('invalidated_at', 'is', null)
        .select(container.db.fn.countAll<number>().as('count'))
        .executeTakeFirst();

      res.json({
        did: row.did,
        handle: row.handle,
        displayName: row.display_name,
        description: row.description,
        cooperativeType: row.cooperative_type,
        membershipPolicy: row.membership_policy,
        memberCount: Number(countResult?.count ?? 0),
        website: row.website,
      });
    }),
  );

  // ── Signed POST endpoints (require federation auth) ──

  router.post(
    '/api/v1/federation/membership/request',
    fedAuth,
    asyncHandler(async (req, res) => {
      const params = MembershipRequestSchema.parse(req.body);
      const now = container.clock.now();

      // Process locally: create membership PDS record on this instance
      const ref = await container.pdsService.createRecord({
        did: params.memberDid as DID,
        collection: 'network.coopsource.org.membership',
        record: {
          cooperative: params.cooperativeDid,
          message: params.message,
          createdAt: now.toISOString(),
        },
      });

      res.status(201).json({
        memberRecordUri: ref.uri,
        memberRecordCid: ref.cid,
      });
    }),
  );

  router.post(
    '/api/v1/federation/membership/approve',
    fedAuth,
    asyncHandler(async (req, res) => {
      const params = MembershipApproveSchema.parse(req.body);
      const now = container.clock.now();

      // Process locally: create memberApproval PDS record on this instance
      const ref = await container.pdsService.createRecord({
        did: params.cooperativeDid as DID,
        collection: 'network.coopsource.org.memberApproval',
        record: {
          member: params.memberDid,
          roles: params.roles,
          createdAt: now.toISOString(),
        },
      });

      res.status(201).json({
        approvalRecordUri: ref.uri,
        approvalRecordCid: ref.cid,
      });
    }),
  );

  router.post(
    '/api/v1/federation/agreement/sign-request',
    fedAuth,
    asyncHandler(async (req, res) => {
      const _params = AgreementSignRequestSchema.parse(req.body);
      res.status(501).json({ error: 'NotImplemented', message: 'Agreement signing federation not yet implemented' });
    }),
  );

  router.post(
    '/api/v1/federation/agreement/signature',
    fedAuth,
    asyncHandler(async (_req, res) => {
      res.status(501).json({ error: 'NotImplemented', message: 'Agreement signature federation not yet implemented' });
    }),
  );

  // ── Hub-only endpoints ──

  router.post(
    '/api/v1/federation/hub/register',
    fedAuth,
    asyncHandler(async (req, res) => {
      if (
        config.INSTANCE_ROLE !== 'hub' &&
        config.INSTANCE_ROLE !== 'standalone'
      ) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'This endpoint is only available on hub instances',
        });
        return;
      }
      const _params = HubRegisterSchema.parse(req.body);
      res.status(501).json({ error: 'NotImplemented', message: 'Hub registration not yet implemented' });
    }),
  );

  router.post(
    '/api/v1/federation/hub/notify',
    fedAuth,
    asyncHandler(async (req, res) => {
      if (
        config.INSTANCE_ROLE !== 'hub' &&
        config.INSTANCE_ROLE !== 'standalone'
      ) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'This endpoint is only available on hub instances',
        });
        return;
      }
      const _event = HubNotifySchema.parse(req.body);
      res.status(501).json({ error: 'NotImplemented', message: 'Hub notification not yet implemented' });
    }),
  );

  return router;
}
