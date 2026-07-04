import { Router } from 'express';
import { z } from 'zod';
import type { DID } from '@coopsource/common';
import { NotFoundError } from '@coopsource/common';
import type { Container } from '../container.js';
import type { DidWebResolver } from '@coopsource/federation/http';
import type { AppConfig } from '../config.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireFederationAuth } from '../middleware/federation-auth.js';

// Roles that carry authority to manage a cooperative's membership roster.
const COOP_MANAGEMENT_ROLES = ['owner', 'admin'];

/**
 * The authoritative caller identity for a federation request: the verified
 * peer signer (server-to-server) or the local session subject. Never a
 * request-body field — those are attacker-controlled.
 */
function federationCallerDid(req: {
  federationSender?: unknown;
  session?: { did?: string };
}): string | null {
  const sender = (req as { federationSender?: unknown }).federationSender;
  if (typeof sender === 'string' && sender.length > 0) return sender;
  const sessionDid = req.session?.did;
  if (typeof sessionDid === 'string' && sessionDid.length > 0) return sessionDid;
  return null;
}

/**
 * Axis 2 authority check: may `callerDid` manage membership for `cooperativeDid`?
 * True when the caller is the cooperative itself (its server signs as the coop
 * DID) or holds an active owner/admin role in that cooperative.
 */
async function callerHasCoopAuthority(
  container: Container,
  callerDid: string | null,
  cooperativeDid: DID,
): Promise<boolean> {
  if (!callerDid) return false;
  if (callerDid === cooperativeDid) return true;
  const row = await container.db
    .selectFrom('membership')
    .innerJoin(
      'membership_role',
      'membership_role.membership_id',
      'membership.id',
    )
    .where('membership.cooperative_did', '=', cooperativeDid)
    .where('membership.member_did', '=', callerDid)
    .where('membership.status', '=', 'active')
    .where('membership.invalidated_at', 'is', null)
    .where('membership_role.role', 'in', COOP_MANAGEMENT_ROLES)
    .select('membership_role.role')
    .executeTakeFirst();
  return row !== undefined;
}

// ── Zod schemas for request validation ──

const MembershipRequestSchema = z.object({
  memberDid: z.string().min(1),
  cooperativeDid: z.string().min(1),
  consentRecordUri: z.string().min(1),
  consentRecordCid: z.string().min(1),
});

const MembershipApproveSchema = z.object({
  cooperativeDid: z.string().min(1),
  memberDid: z.string().min(1),
  consentRecordUri: z.string().min(1),
  consentRecordCid: z.string().min(1),
  roles: z.array(z.string().min(1)),
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
 * container.pdsService directly — the receiving instance always processes locally.
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
          'cooperative_profile.public_description',
          'cooperative_profile.public_members',
          'cooperative_profile.public_activity',
          'cooperative_profile.public_agreements',
          'cooperative_profile.public_campaigns',
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
        visibility: {
          publicDescription: row.public_description,
          publicMembers: row.public_members,
          publicActivity: row.public_activity,
          publicAgreements: row.public_agreements,
          publicCampaigns: row.public_campaigns,
        },
      });
    }),
  );

  // ── Signed POST endpoints (require federation auth) ──

  router.post(
    '/api/v1/federation/membership/request',
    fedAuth,
    asyncHandler(async (req, res) => {
      const params = MembershipRequestSchema.parse(req.body);
      const verification = await container.consentEvidenceVerifier.verify({
        expectedAuthorDid: params.memberDid as DID,
        cooperativeDid: params.cooperativeDid as DID,
        consentRecordUri: params.consentRecordUri,
        consentRecordCid: params.consentRecordCid,
        allowedConsentTypes: ['joinRequest', 'networkJoin'],
      });
      if (!verification.ok) {
        res.status(400).json({
          error: 'InvalidConsentEvidence',
          message: verification.reason ?? 'Consent evidence verification failed',
        });
        return;
      }

      res.status(201).json({
        consentRecordUri: params.consentRecordUri,
        consentRecordCid: params.consentRecordCid,
      });
    }),
  );

  router.post(
    '/api/v1/federation/membership/approve',
    fedAuth,
    asyncHandler(async (req, res) => {
      const params = MembershipApproveSchema.parse(req.body);
      const now = container.clock.now();

      // Axis 2 (group authority): approving a member into a cooperative is a
      // cooperative-side act. Consent proves the *member* agreed; it says
      // nothing about the caller. Bind the caller to authority over the target
      // cooperative before any mutation — otherwise any authenticated local
      // user or any peer signing as a DID it controls could inject an active
      // membership (with arbitrary roles) into an arbitrary cooperative.
      const callerDid = federationCallerDid(req);
      const authorized = await callerHasCoopAuthority(
        container,
        callerDid,
        params.cooperativeDid as DID,
      );
      if (!authorized) {
        res.status(403).json({
          error: 'Forbidden',
          axis: 'spaces',
          message:
            'Caller lacks group authority over the target cooperative',
        });
        return;
      }

      const verification = await container.consentEvidenceVerifier.verify({
        expectedAuthorDid: params.memberDid as DID,
        cooperativeDid: params.cooperativeDid as DID,
        consentRecordUri: params.consentRecordUri,
        consentRecordCid: params.consentRecordCid,
        allowedConsentTypes: ['joinRequest', 'invitationAcceptance', 'networkJoin'],
      });
      if (!verification.ok) {
        res.status(400).json({
          error: 'InvalidConsentEvidence',
          message: verification.reason ?? 'Consent evidence verification failed',
        });
        return;
      }

      const result = await container.groupMutations.addMember({
        cooperativeDid: params.cooperativeDid as DID,
        memberDid: params.memberDid as DID,
        actorDid: (callerDid ?? params.cooperativeDid) as DID,
        roles: params.roles,
        consentRecordUri: params.consentRecordUri,
        consentRecordCid: params.consentRecordCid,
        joinedAt: now,
        reason: 'federation membership approve',
      });
      if (!result.ok) {
        res.status(400).json({
          error: 'ValidationError',
          message: 'Invalid membership mutation',
        });
        return;
      }

      res.status(201).json({
        ok: true,
        changed: result.changed,
        auditEventId: result.auditEventId ?? null,
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

  // No fedAuth — these endpoints return 501 unconditionally (V3 deprecated)
  router.post(
    '/api/v1/federation/hub/register',
    asyncHandler(async (_req, res) => {
      res.status(501).json({
        error: 'NotImplemented',
        message: 'Hub registration is deprecated. Cooperatives are discovered via the ATProto relay firehose.',
      });
    }),
  );

  router.post(
    '/api/v1/federation/hub/notify',
    asyncHandler(async (_req, res) => {
      res.status(501).json({
        error: 'NotImplemented',
        message: 'Hub notification is deprecated. Events flow through the ATProto firehose.',
      });
    }),
  );

  return router;
}
