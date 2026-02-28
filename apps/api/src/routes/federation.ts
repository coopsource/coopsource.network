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
  agreementTitle: z.string().optional(),
  signerDid: z.string().min(1),
  cooperativeDid: z.string().min(1),
});

const AgreementSignatureSchema = z.object({
  agreementUri: z.string().min(1),
  signerDid: z.string().min(1),
  signatureUri: z.string().min(1),
  signatureCid: z.string().min(1),
  cooperativeDid: z.string().min(1),
  statement: z.string().optional(),
});

const AgreementSignResponseSchema = z.object({
  agreementUri: z.string().min(1),
  signerDid: z.string().min(1),
  cooperativeDid: z.string().min(1),
  reason: z.string().optional(),
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

  // ── Agreement signing federation endpoints ──

  router.post(
    '/api/v1/federation/agreement/sign-request',
    fedAuth,
    asyncHandler(async (req, res) => {
      const params = AgreementSignRequestSchema.parse(req.body);

      // Verify signer exists on this instance
      const signer = await container.db
        .selectFrom('entity')
        .where('did', '=', params.signerDid)
        .where('invalidated_at', 'is', null)
        .select('did')
        .executeTakeFirst();

      if (!signer) {
        throw new NotFoundError(`Signer not found: ${params.signerDid}`);
      }

      // Check no pending request already exists
      const existing = await container.db
        .selectFrom('signature_request')
        .where('agreement_uri', '=', params.agreementUri)
        .where('signer_did', '=', params.signerDid)
        .where('status', '=', 'pending')
        .select('id')
        .executeTakeFirst();

      if (existing) {
        res.status(409).json({
          error: 'Conflict',
          message: 'A pending signature request already exists for this agreement and signer',
        });
        return;
      }

      const now = container.clock.now();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const [request] = await container.db
        .insertInto('signature_request')
        .values({
          agreement_uri: params.agreementUri,
          agreement_title: params.agreementTitle ?? null,
          signer_did: params.signerDid,
          cooperative_did: params.cooperativeDid,
          requester_did: params.cooperativeDid,
          status: 'pending',
          requested_at: now,
          expires_at: expiresAt,
          created_at: now,
        })
        .returningAll()
        .execute();

      res.json({
        acknowledged: true,
        requestId: request!.id,
        expiresAt: expiresAt.toISOString(),
      });
    }),
  );

  router.post(
    '/api/v1/federation/agreement/signature',
    fedAuth,
    asyncHandler(async (req, res) => {
      const params = AgreementSignatureSchema.parse(req.body);

      // Verify agreement exists locally and is open
      const agreement = await container.db
        .selectFrom('agreement')
        .where('uri', '=', params.agreementUri)
        .select(['uri', 'status', 'title'])
        .executeTakeFirst();

      if (!agreement) {
        throw new NotFoundError(`Agreement not found: ${params.agreementUri}`);
      }

      if (agreement.status !== 'open') {
        res.status(400).json({
          error: 'BadRequest',
          message: 'Agreement is not open for signing',
        });
        return;
      }

      // Check no duplicate active signature
      const existingSig = await container.db
        .selectFrom('agreement_signature')
        .where('agreement_uri', '=', params.agreementUri)
        .where('signer_did', '=', params.signerDid)
        .where('retracted_at', 'is', null)
        .select('id')
        .executeTakeFirst();

      if (existingSig) {
        res.status(409).json({
          error: 'Conflict',
          message: 'Signer already has an active signature on this agreement',
        });
        return;
      }

      const now = container.clock.now();

      // Insert into agreement_signature
      const [sig] = await container.db
        .insertInto('agreement_signature')
        .values({
          uri: params.signatureUri,
          cid: params.signatureCid,
          agreement_id: null,
          agreement_uri: params.agreementUri,
          agreement_cid: '',
          signer_did: params.signerDid,
          statement: params.statement ?? null,
          signed_at: now,
          created_at: now,
          indexed_at: now,
        })
        .returningAll()
        .execute();

      // Update matching signature_request status to 'signed' (if exists)
      await container.db
        .updateTable('signature_request')
        .set({
          status: 'signed',
          responded_at: now,
          signature_uri: params.signatureUri,
          signature_cid: params.signatureCid,
        })
        .where('agreement_uri', '=', params.agreementUri)
        .where('signer_did', '=', params.signerDid)
        .where('status', '=', 'pending')
        .execute();

      res.status(201).json({ recorded: true, signatureId: sig!.id });
    }),
  );

  router.post(
    '/api/v1/federation/agreement/sign-reject',
    fedAuth,
    asyncHandler(async (req, res) => {
      const params = AgreementSignResponseSchema.parse(req.body);
      const now = container.clock.now();

      const result = await container.db
        .updateTable('signature_request')
        .set({
          status: 'rejected',
          responded_at: now,
          response_message: params.reason ?? null,
        })
        .where('agreement_uri', '=', params.agreementUri)
        .where('signer_did', '=', params.signerDid)
        .where('status', '=', 'pending')
        .executeTakeFirst();

      if (!result || BigInt(result.numUpdatedRows) === 0n) {
        throw new NotFoundError('No pending signature request found');
      }

      res.json({ acknowledged: true });
    }),
  );

  router.post(
    '/api/v1/federation/agreement/sign-cancel',
    fedAuth,
    asyncHandler(async (req, res) => {
      const params = AgreementSignResponseSchema.parse(req.body);
      const now = container.clock.now();

      const result = await container.db
        .updateTable('signature_request')
        .set({
          status: 'cancelled',
          responded_at: now,
          response_message: params.reason ?? null,
        })
        .where('agreement_uri', '=', params.agreementUri)
        .where('signer_did', '=', params.signerDid)
        .where('status', '=', 'pending')
        .executeTakeFirst();

      if (!result || BigInt(result.numUpdatedRows) === 0n) {
        throw new NotFoundError('No pending signature request found');
      }

      res.json({ acknowledged: true });
    }),
  );

  router.post(
    '/api/v1/federation/agreement/signature-retract',
    fedAuth,
    asyncHandler(async (req, res) => {
      const params = AgreementSignResponseSchema.parse(req.body);

      // Verify matching active signature exists
      const sig = await container.db
        .selectFrom('agreement_signature')
        .where('agreement_uri', '=', params.agreementUri)
        .where('signer_did', '=', params.signerDid)
        .where('retracted_at', 'is', null)
        .select('id')
        .executeTakeFirst();

      if (!sig) {
        throw new NotFoundError('No active signature found');
      }

      const now = container.clock.now();

      // Retract the signature
      await container.db
        .updateTable('agreement_signature')
        .set({
          retracted_at: now,
          retracted_by: params.signerDid,
          retraction_reason: params.reason ?? null,
        })
        .where('id', '=', sig.id)
        .execute();

      // Update matching signature_request status to 'retracted' (if exists)
      await container.db
        .updateTable('signature_request')
        .set({
          status: 'retracted',
          responded_at: now,
          response_message: params.reason ?? null,
        })
        .where('agreement_uri', '=', params.agreementUri)
        .where('signer_did', '=', params.signerDid)
        .where('status', '=', 'signed')
        .execute();

      res.json({ acknowledged: true });
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
      const params = HubRegisterSchema.parse(req.body);

      // Resolve DID to get PDS URL
      let pdsUrl: string;
      try {
        const doc = await didResolver.resolve(params.cooperativeDid);
        const service = doc.service.find(
          (s: { type: string; serviceEndpoint: string }) =>
            s.type === 'CoopSourcePds' ||
            s.type === 'AtprotoPersonalDataServer',
        );
        pdsUrl = service?.serviceEndpoint ?? params.hubUrl;
      } catch {
        // Fallback: use the hubUrl as pds_url if DID resolution fails
        pdsUrl = params.hubUrl;
      }

      const now = container.clock.now();

      // Upsert: insert or update on conflict (idempotent re-registration)
      await container.db
        .insertInto('federation_peer')
        .values({
          did: params.cooperativeDid,
          display_name: params.metadata.displayName,
          description: params.metadata.description ?? null,
          cooperative_type: params.metadata.cooperativeType ?? null,
          website: params.metadata.website ?? null,
          pds_url: pdsUrl,
          registered_at: now,
          last_seen_at: now,
          status: 'active',
          created_at: now,
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.column('did').doUpdateSet({
            display_name: params.metadata.displayName,
            description: params.metadata.description ?? null,
            cooperative_type: params.metadata.cooperativeType ?? null,
            website: params.metadata.website ?? null,
            pds_url: pdsUrl,
            last_seen_at: now,
            status: 'active',
            updated_at: now,
          }),
        )
        .execute();

      res.json({ registered: true, did: params.cooperativeDid });
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
      const event = HubNotifySchema.parse(req.body);

      // Update last_seen_at for the source peer
      const now = container.clock.now();
      await container.db
        .updateTable('federation_peer')
        .set({ last_seen_at: now, updated_at: now })
        .where('did', '=', event.sourceDid)
        .execute();

      res.json({ acknowledged: true, eventType: event.type });
    }),
  );

  return router;
}
