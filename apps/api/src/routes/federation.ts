import { Router, type Response } from 'express';
import { z } from 'zod';
import type { DID, Permission } from '@coopsource/common';
import { NotFoundError } from '@coopsource/common';
import type { Container } from '../container.js';
import type { DidWebResolver } from '@coopsource/federation/http';
import type { AppConfig } from '../config.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireFederationAuth } from '../middleware/federation-auth.js';
import { emitMemberJoined } from '../appview/membership-events.js';
import {
  membershipAuthorityErrorCode,
  membershipAuthorityHttpStatus,
  type PermissionCheckResult,
} from '../services/membership-read-model.js';

/** The subset of an Express request the caller-identity helpers read. */
interface FederationCallerRequest {
  federationSender?: unknown;
  session?: { did?: string };
}

/**
 * The authoritative caller identity for a federation request: the verified
 * peer signer (server-to-server) or the local session subject. Never a
 * request-body field — those are attacker-controlled.
 */
function federationCallerDid(req: FederationCallerRequest): string | null {
  const sender = (req as { federationSender?: unknown }).federationSender;
  if (typeof sender === 'string' && sender.length > 0) return sender;
  const sessionDid = req.session?.did;
  if (typeof sessionDid === 'string' && sessionDid.length > 0)
    return sessionDid;
  return null;
}

/**
 * Axis 5 (service-auth) gate: the caller must *be* the DID the request body
 * says is acting. Writes the 403 and returns `null` when it is not, so the
 * handler's only obligation is `if (caller === null) return;`.
 *
 * Deliberately strict equality rather than "may the caller act for that DID"
 * (audit C-04). `signerDid` may itself be a cooperative, and `agreement.sign`
 * sits in the built-in `member` role — so a permission-shaped generalisation
 * would let any plain member mint their cooperative's binding signature, which
 * is the same forgery one level up. A cooperative signing for itself still
 * passes: its server signs the federation request as the cooperative DID.
 *
 * `service-auth` is the right axis here: no space is consulted and no group
 * decision is made, only "is the caller who they claim to be acting as".
 */
function requireSelfActingCaller(
  req: FederationCallerRequest,
  res: Response,
  assertedDid: string,
): string | null {
  const callerDid = federationCallerDid(req);
  if (callerDid === null || callerDid !== assertedDid) {
    res.status(403).json({
      error: 'Forbidden',
      axis: 'service-auth',
      message: 'Caller may not act as the asserted signer',
    });
    return null;
  }
  return callerDid;
}

/**
 * Axis 2 (spaces) gate: the caller must hold `permission` in `cooperativeDid`.
 * Writes the response and returns `null` on denial (403) or on degraded
 * membership authority (503, fail closed); returns the caller DID otherwise,
 * which handlers need as the actor of whatever they go on to write.
 */
async function requireCoopAuthority(
  container: Container,
  req: FederationCallerRequest,
  res: Response,
  cooperativeDid: DID,
  permission: Permission,
  deniedMessage = 'Caller lacks group authority over the target cooperative',
): Promise<string | null> {
  const callerDid = federationCallerDid(req);
  const authorization = await callerHasCoopPermission(
    container,
    callerDid,
    cooperativeDid,
    permission,
  );
  if (!authorization.ok) {
    res.status(membershipAuthorityHttpStatus(authorization, 403)).json({
      error: membershipAuthorityErrorCode(authorization, 'Forbidden'),
      axis: authorization.axis,
      reason: authorization.reason,
      message: authorization.message,
    });
    return null;
  }
  // `callerDid === null` is already covered by `!allowed` — an anonymous caller
  // can never be allowed — but stating it here is what makes the non-null
  // return provable rather than asserted.
  if (!authorization.allowed || callerDid === null) {
    res.status(403).json({
      error: 'Forbidden',
      axis: 'spaces',
      message: deniedMessage,
    });
    return null;
  }
  return callerDid;
}

/**
 * Axis 2 authority check: may `callerDid` manage membership for `cooperativeDid`?
 * True when the caller is the cooperative itself (its server signs as the coop
 * DID) or holds the given permission via its roles — resolved through the
 * shared role_definition model (so any role granted the permission qualifies,
 * not a hardcoded role list; `admin`/`owner` qualify via the `'*'` wildcard,
 * `coordinator` via an explicit `member.approve`, plain members do not).
 */
async function callerHasCoopPermission(
  container: Container,
  callerDid: string | null,
  cooperativeDid: DID,
  permission: Permission,
): Promise<PermissionCheckResult> {
  if (!callerDid) return { ok: true, allowed: false };
  if (callerDid === cooperativeDid) return { ok: true, allowed: true };
  return container.membershipReadModel.hasPermissionResult(
    cooperativeDid,
    callerDid as DID,
    permission,
  );
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
  // Free text chosen by the requester that lands verbatim in the target's
  // "please sign this" inbox — bounded like every other title in the app.
  agreementTitle: z.string().max(255).optional(),
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
  // Audit N-25: inbound signatures are verified against this instance's own
  // configured origin, not the `Host` the caller chose to send. This is the
  // first read of `config` in this file — the parameter existed unused.
  const fedAuth = requireFederationAuth(didResolver, config.PUBLIC_API_URL);

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

      const memberCountResult =
        await container.membershipReadModel.countActiveMembersResult(
          did as DID,
        );
      if (!memberCountResult.ok) {
        res.status(membershipAuthorityHttpStatus(memberCountResult, 503)).json({
          error: membershipAuthorityErrorCode(
            memberCountResult,
            'SPACES_AUTHORITY_UNAVAILABLE',
          ),
          message: memberCountResult.message,
          axis: memberCountResult.axis,
          reason: memberCountResult.reason,
        });
        return;
      }

      res.json({
        did: row.did,
        handle: row.handle,
        displayName: row.display_name,
        description: row.description,
        cooperativeType: row.cooperative_type,
        membershipPolicy: row.membership_policy,
        memberCount: memberCountResult.count,
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
          message:
            verification.reason ?? 'Consent evidence verification failed',
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
      const callerDid = await requireCoopAuthority(
        container,
        req,
        res,
        params.cooperativeDid as DID,
        'member.approve',
      );
      if (callerDid === null) return;

      const verification = await container.consentEvidenceVerifier.verify({
        expectedAuthorDid: params.memberDid as DID,
        cooperativeDid: params.cooperativeDid as DID,
        consentRecordUri: params.consentRecordUri,
        consentRecordCid: params.consentRecordCid,
        allowedConsentTypes: [
          'joinRequest',
          'invitationAcceptance',
          'networkJoin',
        ],
      });
      if (!verification.ok) {
        res.status(400).json({
          error: 'InvalidConsentEvidence',
          message:
            verification.reason ?? 'Consent evidence verification failed',
        });
        return;
      }

      // Axis 2 continued: `member.approve` authorises admitting this member,
      // not admitting them above the approver's own level. Same ceiling the
      // HTTP role paths enforce (audit S-01) — without it this route was a way
      // around that guard. Throws ForbiddenError, which the error middleware
      // renders as 403.
      await container.membershipService.assertRoleAssignmentAllowed({
        cooperativeDid: params.cooperativeDid,
        actorDid: callerDid,
        requestedRoles: params.roles,
        targetDid: params.memberDid,
      });

      const result = await container.groupMutations.addMember({
        cooperativeDid: params.cooperativeDid as DID,
        memberDid: params.memberDid as DID,
        actorDid: callerDid as DID,
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
      if (result.changed) {
        emitMemberJoined(params.cooperativeDid, params.memberDid);
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

      // Axis 2 (group authority): asking someone to sign is a cooperative-side
      // act performed in the cooperative's name — the row's `requester_did` is
      // `params.cooperativeDid`. Bind the caller to authority over that
      // cooperative before anything is written (audit C-04).
      const callerDid = await requireCoopAuthority(
        container,
        req,
        res,
        params.cooperativeDid as DID,
        'agreement.amend',
        'Caller lacks authority to request signatures for this cooperative',
      );
      if (callerDid === null) return;

      // ...and the *agreement* must belong to that same cooperative. Authority
      // over a cooperative authorises soliciting signatures on that
      // cooperative's own agreements, nothing else. Without this the caller
      // supplies both halves independently: anyone who controls any
      // cooperative (its founder, or a peer signing as its own DID — which
      // `callerHasCoopPermission` short-circuits to "allowed") could mint a
      // pending request against another cooperative's open agreement, and that
      // row then satisfies `/signature`'s pending-request check, restoring the
      // unbidden self-mint that check exists to prevent.
      //
      // This replaces an earlier "signer must be a member of the cooperative"
      // rule, which bound the wrong half: it left the loop above open while
      // making a bilateral X<->Y agreement impossible, since X could then only
      // ask its own members to sign. Ownership is the correct invariant —
      // the signer is deliberately unconstrained.
      const agreement = await container.db
        .selectFrom('agreement')
        .where('uri', '=', params.agreementUri)
        .select(['uri', 'project_uri'])
        .executeTakeFirst();

      // A missing agreement folds into this same 403 rather than answering
      // 404. The caller has authority over one cooperative and is asking about
      // an arbitrary URI, so distinguishing "no such agreement" from "not
      // yours" would hand them an existence oracle over every agreement on the
      // instance. "Not an agreement of this cooperative" is true either way.
      if (!agreement || agreement.project_uri !== params.cooperativeDid) {
        res.status(403).json({
          error: 'Forbidden',
          axis: 'spaces',
          message:
            'Agreement does not belong to the cooperative making the request',
        });
        return;
      }

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
          message:
            'A pending signature request already exists for this agreement and signer',
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

      // Axis 5 (service-auth): this route mints the legally operative
      // signature row. Only the signer may do that (audit C-04).
      if (requireSelfActingCaller(req, res, params.signerDid) === null) return;

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

      // Identity alone is not enough: without a request to sign, any session
      // holder — a pending applicant `requireAuth` turns away elsewhere, an
      // observer, a member of an unrelated cooperative — could attach a
      // binding signature of their own to any open agreement on this instance.
      // Signing is a *response*, so it needs the invitation it responds to.
      // Placed after the duplicate check so an already-signed signer still
      // gets the 409 that describes their actual situation.
      const pendingRequest = await container.db
        .selectFrom('signature_request')
        .where('agreement_uri', '=', params.agreementUri)
        .where('signer_did', '=', params.signerDid)
        .where('status', '=', 'pending')
        .select('id')
        .executeTakeFirst();

      if (!pendingRequest) {
        res.status(403).json({
          error: 'Forbidden',
          axis: 'service-auth',
          message: 'No pending signature request for this signer',
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

      // Axis 5 (service-auth): declining is the addressee's own verb — nobody
      // else may answer a request on their behalf (audit C-04).
      if (requireSelfActingCaller(req, res, params.signerDid) === null) return;

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

      // Cancelling is the *requester's* verb, not the signer's — the same
      // withdrawal the cooperative-side amendment paths perform. So this route
      // takes either identity: the signer acting for themselves, or a caller
      // with `agreement.amend` in the cooperative named in the body. The body
      // DID is only ever the subject of a permission lookup here; it is never
      // treated as the caller's identity (audit C-04).
      const callerDid = federationCallerDid(req);
      if (callerDid === null || callerDid !== params.signerDid) {
        const authorized = await requireCoopAuthority(
          container,
          req,
          res,
          params.cooperativeDid as DID,
          'agreement.amend',
          'Caller is neither the signer nor authorised to cancel signature requests for this cooperative',
        );
        if (authorized === null) return;
      }

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
        // Scoped to the cooperative the authority was granted over. Without
        // this the coop branch above authorises against one cooperative and
        // then mutates a row belonging to another, so `agreement.amend`
        // anywhere on the instance would cancel requests everywhere. The
        // signer-only routes need no such clause: their gate is the row's own
        // `signer_did`, which the WHERE already pins.
        .where('cooperative_did', '=', params.cooperativeDid)
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

      // Axis 5 (service-auth): withdrawing a signature is the signer's own
      // verb. `retracted_by` is written from `params.signerDid`, so without
      // this the audit trail could be forged along with the act (audit C-04).
      if (requireSelfActingCaller(req, res, params.signerDid) === null) return;

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

  return router;
}
