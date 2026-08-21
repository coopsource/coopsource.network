/**
 * Audit C-04 — the federation agreement endpoints took the acting DID from the
 * request body and never checked the caller could act for it.
 *
 * Both reachability paths were unbound. `requireFederationAuth` short-circuits
 * on any local session cookie (leaving `req.federationSender` undefined), and
 * on the signed-peer path the verified signer was never compared against the
 * body's `signerDid`. So any registered user — and any peer that could sign as
 * some DID it controls — could mint, retract, decline or solicit signatures in
 * anyone else's name.
 *
 * These tests drive the exploit paths rather than the helpers, and each one
 * pairs its denial with the positive sibling that must still work, so a gate
 * that simply refuses everything cannot pass.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as nodeCrypto from 'node:crypto';
import supertest from 'supertest';
import { BUILT_IN_ROLES, type DID } from '@coopsource/common';
import type { DidDocument } from '@coopsource/federation';
import { signRequest } from '@coopsource/federation/http';
import { truncateAllTables } from './helpers/test-db.js';
import {
  createTestApp,
  setupAndLogin,
  type TestApp,
} from './helpers/test-app.js';
import { membershipAuthorityFailure } from '../src/services/membership-read-model.js';
import { requireFederationAuth } from '../src/middleware/federation-auth.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
/** A cooperative the caller controls but which owns none of the agreements here. */
const FOREIGN_COOP_DID = 'did:plc:foreignauthzcoop';
const LOOP_COOP_DID = 'did:plc:loopauthzcoop';

describe('Federation agreement authorization (C-04)', () => {
  let testApp: TestApp;
  let coopDid: string;
  /** Owner+admin of the cooperative, and the impersonation target throughout. */
  let victimDid: string;
  /** A self-registered plain member — the lowest-privilege authenticated caller. */
  let attacker: supertest.Agent;
  let attackerDid: string;

  beforeAll(async () => {
    await truncateAllTables();
    testApp = createTestApp();
    const setup = await setupAndLogin(testApp);
    coopDid = setup.coopDid;
    victimDid = setup.adminDid;

    const registered = await register('mallory@authz.test', 'mallory');
    attacker = registered.agent;
    attackerDid = registered.did;
  });

  // ── fixtures ──

  async function register(
    email: string,
    handle: string,
  ): Promise<{ agent: supertest.Agent; did: string }> {
    const agent = supertest.agent(testApp.app);
    const res = await agent
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'password123',
        displayName: handle,
        handle,
      })
      .expect(201);
    return { agent, did: res.body.did };
  }

  /**
   * A second cooperative whose admin genuinely holds `agreement.amend` there.
   *
   * The role definitions are the load-bearing part: `resolveRolePermissions`
   * reads `role_definition` per cooperative with no built-in fallback, so an
   * entity + membership alone yields a member with *no* permissions — and a
   * cross-cooperative denial test built on that would pass for the wrong
   * reason, proving only that a nobody is refused.
   */
  async function createCooperative(
    did: string,
    displayName: string,
  ): Promise<void> {
    const now = testApp.clock.now();
    await testApp.container.db
      .insertInto('entity')
      .values({
        did,
        type: 'cooperative',
        display_name: displayName,
        status: 'active',
        created_at: now,
        indexed_at: now,
      })
      .onConflict((oc) => oc.column('did').doNothing())
      .execute();
    await testApp.container.db
      .insertInto('role_definition')
      .values(
        Object.entries(BUILT_IN_ROLES).map(([name, def]) => ({
          cooperative_did: did,
          name,
          permissions: [...def.permissions],
          inherits: [...(def.inherits ?? [])],
          is_builtin: true,
          created_at: now,
          updated_at: now,
        })),
      )
      .execute();
  }

  /** A person entity with no membership anywhere — a valid but unaffiliated signer. */
  async function createPerson(did: string, displayName: string): Promise<void> {
    const now = testApp.clock.now();
    await testApp.container.db
      .insertInto('entity')
      .values({
        did,
        type: 'person',
        display_name: displayName,
        status: 'active',
        created_at: now,
        indexed_at: now,
      })
      .onConflict((oc) => oc.column('did').doNothing())
      .execute();
  }

  /** Creates and opens an agreement owned by `coopDid` (`agreement.project_uri`). */
  async function openAgreement(title: string): Promise<string> {
    const agreement = await testApp.container.agreementService.createAgreement(
      victimDid,
      coopDid,
      { title, agreementType: 'operating' },
    );
    await testApp.container.agreementService.openAgreement(
      agreement.uri,
      victimDid,
    );
    return agreement.uri;
  }

  /**
   * Seeded directly rather than through `/sign-request` so these tests depend
   * on one gate at a time — a regression in the request route must not be able
   * to masquerade as a regression in the signature route.
   */
  async function seedPendingRequest(
    agreementUri: string,
    signerDid: string,
  ): Promise<void> {
    const now = testApp.clock.now();
    await testApp.container.db
      .insertInto('signature_request')
      .values({
        agreement_uri: agreementUri,
        signer_did: signerDid,
        cooperative_did: coopDid,
        requester_did: coopDid,
        status: 'pending',
        requested_at: now,
        expires_at: new Date(now.getTime() + THIRTY_DAYS_MS),
        created_at: now,
      })
      .execute();
  }

  function signatures(agreementUri: string, signerDid: string) {
    return testApp.container.db
      .selectFrom('agreement_signature')
      .where('agreement_uri', '=', agreementUri)
      .where('signer_did', '=', signerDid)
      .select(['id', 'uri', 'retracted_at', 'retracted_by'])
      .execute();
  }

  function signatureRequests(agreementUri: string, signerDid: string) {
    return testApp.container.db
      .selectFrom('signature_request')
      .where('agreement_uri', '=', agreementUri)
      .where('signer_did', '=', signerDid)
      .select(['id', 'status', 'requester_did'])
      .execute();
  }

  // ── POST /agreement/signature — minting the legal signature ──

  describe('POST /api/v1/federation/agreement/signature', () => {
    it('refuses a signature minted under another member’s DID', async () => {
      const agreementUri = await openAgreement('Forge Target');
      await seedPendingRequest(agreementUri, victimDid);

      const res = await attacker
        .post('/api/v1/federation/agreement/signature')
        .send({
          agreementUri,
          signerDid: victimDid,
          signatureUri: 'at://did:test/agreement.signature/forged-1',
          signatureCid: 'bafyforged1',
          cooperativeDid: coopDid,
          statement: 'I, the victim, agree (forged)',
        })
        .expect(403);

      expect(res.body.axis).toBe('service-auth');
      expect(await signatures(agreementUri, victimDid)).toHaveLength(0);
    });

    it('records the signature when the caller is the signer', async () => {
      const agreementUri = await openAgreement('Genuine Signature');
      await seedPendingRequest(agreementUri, victimDid);

      const res = await testApp.agent
        .post('/api/v1/federation/agreement/signature')
        .send({
          agreementUri,
          signerDid: victimDid,
          signatureUri: 'at://did:test/agreement.signature/genuine-1',
          signatureCid: 'bafygenuine1',
          cooperativeDid: coopDid,
        })
        .expect(201);

      expect(res.body.recorded).toBe(true);
      const rows = await signatures(agreementUri, victimDid);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.uri).toBe('at://did:test/agreement.signature/genuine-1');
    });

    it('denies the forgery and leaves the real signer able to sign', async () => {
      // The three facts of the denial-of-signature variant in one test: the
      // forgery is refused, it writes nothing, and the DID it named can still
      // sign afterwards.
      //
      // Pre-fix, the forged row survived and the genuine attempt came back 409
      // — from the handler's own duplicate check a few lines above the insert,
      // with `idx_agreement_signature_uri_signer_active` as the database
      // backstop behind it. It is the application check that answers 409 here,
      // not the index.
      const agreementUri = await openAgreement('Denial Of Signature');
      await seedPendingRequest(agreementUri, victimDid);

      const forged = await attacker
        .post('/api/v1/federation/agreement/signature')
        .send({
          agreementUri,
          signerDid: victimDid,
          signatureUri: 'at://did:test/agreement.signature/forged-2',
          signatureCid: 'bafyforged2',
          cooperativeDid: coopDid,
        })
        .expect(403);
      expect(forged.body.axis).toBe('service-auth');
      expect(await signatures(agreementUri, victimDid)).toHaveLength(0);

      await testApp.agent
        .post('/api/v1/federation/agreement/signature')
        .send({
          agreementUri,
          signerDid: victimDid,
          signatureUri: 'at://did:test/agreement.signature/genuine-2',
          signatureCid: 'bafygenuine2',
          cooperativeDid: coopDid,
        })
        .expect(201);

      const rows = await signatures(agreementUri, victimDid);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.uri).toBe('at://did:test/agreement.signature/genuine-2');
    });

    it('refuses a self-signature on an agreement nobody asked the caller to sign', async () => {
      // Identity binding alone is not enough: it stops impersonation but still
      // lets any session holder attach a binding signature of their own to any
      // open agreement on the instance. Signing is a response, so it needs the
      // request it responds to.
      const agreementUri = await openAgreement('Unbidden');

      const res = await attacker
        .post('/api/v1/federation/agreement/signature')
        .send({
          agreementUri,
          signerDid: attackerDid,
          signatureUri: 'at://did:test/agreement.signature/unbidden',
          signatureCid: 'bafyunbidden',
          cooperativeDid: coopDid,
        })
        .expect(403);

      expect(res.body.axis).toBe('service-auth');
      expect(await signatures(agreementUri, attackerDid)).toHaveLength(0);

      // Positive sibling: the same caller, once actually asked.
      await seedPendingRequest(agreementUri, attackerDid);
      await attacker
        .post('/api/v1/federation/agreement/signature')
        .send({
          agreementUri,
          signerDid: attackerDid,
          signatureUri: 'at://did:test/agreement.signature/bidden',
          signatureCid: 'bafybidden',
          cooperativeDid: coopDid,
        })
        .expect(201);
      expect(await signatures(agreementUri, attackerDid)).toHaveLength(1);
    });

    it('refuses a pending applicant who has never been admitted', async () => {
      // A `membership.status = 'pending'` applicant holds a real session but is
      // turned away by `requireAuth` on the ordinary routes. Federation must
      // not be the side door: what stops them here is the pending-request gate,
      // since they were never asked to sign anything.
      const profile = await testApp.container.db
        .selectFrom('cooperative_profile')
        .where('entity_did', '=', coopDid)
        .select('membership_policy')
        .executeTakeFirstOrThrow();

      let applicant: supertest.Agent;
      let applicantDid: string;
      await testApp.container.db
        .updateTable('cooperative_profile')
        .set({ membership_policy: 'request_approval' })
        .where('entity_did', '=', coopDid)
        .execute();
      try {
        const registered = await register('applicant@authz.test', 'applicant');
        applicant = registered.agent;
        applicantDid = registered.did;
      } finally {
        await testApp.container.db
          .updateTable('cooperative_profile')
          .set({ membership_policy: profile.membership_policy })
          .where('entity_did', '=', coopDid)
          .execute();
      }

      const membership = await testApp.container.db
        .selectFrom('membership')
        .where('member_did', '=', applicantDid)
        .where('cooperative_did', '=', coopDid)
        .select('status')
        .executeTakeFirstOrThrow();
      expect(membership.status).toBe('pending');

      const agreementUri = await openAgreement('Applicant Reach');
      const res = await applicant
        .post('/api/v1/federation/agreement/signature')
        .send({
          agreementUri,
          signerDid: applicantDid,
          signatureUri: 'at://did:test/agreement.signature/applicant',
          signatureCid: 'bafyapplicant',
          cooperativeDid: coopDid,
        })
        .expect(403);

      expect(res.body.axis).toBe('service-auth');
      expect(await signatures(agreementUri, applicantDid)).toHaveLength(0);
    });
  });

  // ── POST /agreement/signature-retract ──

  describe('POST /api/v1/federation/agreement/signature-retract', () => {
    it('refuses to retract another member’s signature, and lets the signer retract their own', async () => {
      const agreementUri = await openAgreement('Retraction Target');
      await seedPendingRequest(agreementUri, victimDid);
      await testApp.agent
        .post('/api/v1/federation/agreement/signature')
        .send({
          agreementUri,
          signerDid: victimDid,
          signatureUri: 'at://did:test/agreement.signature/retract-me',
          signatureCid: 'bafyretractme',
          cooperativeDid: coopDid,
        })
        .expect(201);

      const res = await attacker
        .post('/api/v1/federation/agreement/signature-retract')
        .send({
          agreementUri,
          signerDid: victimDid,
          cooperativeDid: coopDid,
          reason: 'retracted by Mallory',
        })
        .expect(403);
      expect(res.body.axis).toBe('service-auth');

      const stillActive = await signatures(agreementUri, victimDid);
      expect(stillActive).toHaveLength(1);
      expect(stillActive[0]!.retracted_at).toBeNull();
      expect(stillActive[0]!.retracted_by).toBeNull();

      // Positive sibling: the signer may withdraw their own signature.
      await testApp.agent
        .post('/api/v1/federation/agreement/signature-retract')
        .send({
          agreementUri,
          signerDid: victimDid,
          cooperativeDid: coopDid,
          reason: 'changed my mind',
        })
        .expect(200);

      const retracted = await signatures(agreementUri, victimDid);
      expect(retracted[0]!.retracted_at).not.toBeNull();
      expect(retracted[0]!.retracted_by).toBe(victimDid);
    });
  });

  // ── POST /agreement/sign-reject ──

  describe('POST /api/v1/federation/agreement/sign-reject', () => {
    it('refuses to decline on another member’s behalf, and lets the signer decline', async () => {
      const agreementUri = await openAgreement('Reject Target');
      await seedPendingRequest(agreementUri, victimDid);

      const res = await attacker
        .post('/api/v1/federation/agreement/sign-reject')
        .send({
          agreementUri,
          signerDid: victimDid,
          cooperativeDid: coopDid,
          reason: 'declined by Mallory',
        })
        .expect(403);
      expect(res.body.axis).toBe('service-auth');

      const untouched = await signatureRequests(agreementUri, victimDid);
      expect(untouched).toHaveLength(1);
      expect(untouched[0]!.status).toBe('pending');

      // Positive sibling: the addressee's own refusal still lands.
      await testApp.agent
        .post('/api/v1/federation/agreement/sign-reject')
        .send({
          agreementUri,
          signerDid: victimDid,
          cooperativeDid: coopDid,
          reason: 'not interested',
        })
        .expect(200);
      expect((await signatureRequests(agreementUri, victimDid))[0]!.status).toBe(
        'rejected',
      );
    });
  });

  // ── POST /agreement/sign-cancel ──

  describe('POST /api/v1/federation/agreement/sign-cancel', () => {
    it('refuses a caller who is neither the signer nor authorised over the cooperative', async () => {
      const agreementUri = await openAgreement('Cancel Target');
      await seedPendingRequest(agreementUri, victimDid);

      const res = await attacker
        .post('/api/v1/federation/agreement/sign-cancel')
        .send({
          agreementUri,
          signerDid: victimDid,
          cooperativeDid: coopDid,
          reason: 'cancelled by Mallory',
        })
        .expect(403);
      // The last gate consulted is group authority over the cooperative, so
      // this denial is Axis 2, not service-auth.
      expect(res.body.axis).toBe('spaces');

      const untouched = await signatureRequests(agreementUri, victimDid);
      expect(untouched[0]!.status).toBe('pending');
    });

    it('lets the signer cancel a request addressed to them', async () => {
      const agreementUri = await openAgreement('Cancel By Signer');
      await seedPendingRequest(agreementUri, attackerDid);

      await attacker
        .post('/api/v1/federation/agreement/sign-cancel')
        .send({
          agreementUri,
          signerDid: attackerDid,
          cooperativeDid: coopDid,
        })
        .expect(200);

      expect((await signatureRequests(agreementUri, attackerDid))[0]!.status).toBe(
        'cancelled',
      );
    });

    it('lets the requesting cooperative withdraw a request addressed to someone else', async () => {
      // Cancelling is the requester's verb — the same withdrawal the
      // cooperative-side amendment paths perform. Binding it to the signer
      // alone would turn it into a duplicate of sign-reject.
      const agreementUri = await openAgreement('Cancel By Coop');
      await seedPendingRequest(agreementUri, attackerDid);

      await testApp.agent
        .post('/api/v1/federation/agreement/sign-cancel')
        .send({
          agreementUri,
          signerDid: attackerDid,
          cooperativeDid: coopDid,
          reason: 'no longer needed',
        })
        .expect(200);

      expect((await signatureRequests(agreementUri, attackerDid))[0]!.status).toBe(
        'cancelled',
      );
    });

    it('does not let authority over one cooperative cancel another’s request', async () => {
      // The coop branch authorises against the body's `cooperativeDid`, so the
      // mutation has to be scoped to that same cooperative — otherwise
      // `agreement.amend` in any cooperative on the instance reaches pending
      // requests belonging to every other one.
      const agreementUri = await openAgreement('Cross Coop Cancel');
      await seedPendingRequest(agreementUri, victimDid);

      const outsiderCoopDid = 'did:plc:crosscoopcancel';
      await createCooperative(outsiderCoopDid, 'Cross Coop');

      const { agent, did } = await register(
        'crosscoop@authz.test',
        'crosscoop',
      );
      await testApp.container
        .groupMutationsForDb(testApp.container.db)
        .addMember({
          cooperativeDid: outsiderCoopDid as DID,
          memberDid: did as DID,
          actorDid: outsiderCoopDid as DID,
          roles: ['admin'],
          reason: 'cross-coop cancel probe',
        });
      // Precondition, not decoration: the claim under test is that a caller who
      // *does* hold the permission somewhere still cannot spend it here.
      expect(
        await testApp.container.membershipReadModel.hasPermissionResult(
          outsiderCoopDid as DID,
          did as DID,
          'agreement.amend',
        ),
      ).toEqual({ ok: true, allowed: true });

      await agent
        .post('/api/v1/federation/agreement/sign-cancel')
        .send({
          agreementUri,
          signerDid: victimDid,
          cooperativeDid: outsiderCoopDid,
          reason: 'cancelled from the wrong cooperative',
        })
        .expect(404);

      expect((await signatureRequests(agreementUri, victimDid))[0]!.status).toBe(
        'pending',
      );
    });
  });

  // ── POST /agreement/sign-request ──

  describe('POST /api/v1/federation/agreement/sign-request', () => {
    it('refuses a plain member soliciting a signature in the cooperative’s name', async () => {
      // A real agreement owned by this cooperative, so the denial can only be
      // the authority gate — a fabricated URI would now also trip the
      // ownership gate and the test would stop isolating what it names.
      const agreementUri = await openAgreement('Solicit Forged');

      const res = await attacker
        .post('/api/v1/federation/agreement/sign-request')
        .send({
          agreementUri,
          agreementTitle: 'Please sign (spoofed)',
          signerDid: victimDid,
          cooperativeDid: coopDid,
        })
        .expect(403);

      expect(res.body.axis).toBe('spaces');
      expect(await signatureRequests(agreementUri, victimDid)).toHaveLength(0);
    });

    it('lets a caller with agreement.amend solicit a signature on their own agreement', async () => {
      const agreementUri = await openAgreement('Solicit Genuine');

      const res = await testApp.agent
        .post('/api/v1/federation/agreement/sign-request')
        .send({
          agreementUri,
          agreementTitle: 'Please sign',
          signerDid: victimDid,
          cooperativeDid: coopDid,
        })
        .expect(200);

      expect(res.body.acknowledged).toBe(true);
      const rows = await signatureRequests(agreementUri, victimDid);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.requester_did).toBe(coopDid);
    });

    it('lets a cooperative solicit a signature from a non-member (inter-coop)', async () => {
      // The bilateral X<->Y case the recursive-cooperative model requires: the
      // signer is deliberately not a member of the soliciting cooperative.
      // An earlier "signer must be a member" rule made this impossible.
      const agreementUri = await openAgreement('Inter Coop Solicitation');
      const outsiderDid = 'did:plc:intercoopsigner';
      await createPerson(outsiderDid, 'Inter-coop Signer');

      expect(
        await testApp.container.membershipReadModel.getActiveMembership(
          coopDid as DID,
          outsiderDid as DID,
        ),
      ).toBeNull();

      const res = await testApp.agent
        .post('/api/v1/federation/agreement/sign-request')
        .send({
          agreementUri,
          agreementTitle: 'Countersign our bilateral agreement',
          signerDid: outsiderDid,
          cooperativeDid: coopDid,
        })
        .expect(200);

      expect(res.body.acknowledged).toBe(true);
      expect(await signatureRequests(agreementUri, outsiderDid)).toHaveLength(1);
    });

    it('refuses a request naming an agreement the cooperative does not own', async () => {
      // Reworked from a signer-membership case. Authority over a cooperative
      // authorises soliciting signatures on *that cooperative's* agreements.
      const agreementUri = await openAgreement('Owned By Us');
      await createCooperative(FOREIGN_COOP_DID, 'Foreign Cooperative');

      const { agent, did } = await register(
        'foreignadmin@authz.test',
        'foreignadmin',
      );
      await testApp.container
        .groupMutationsForDb(testApp.container.db)
        .addMember({
          cooperativeDid: FOREIGN_COOP_DID as DID,
          memberDid: did as DID,
          actorDid: FOREIGN_COOP_DID as DID,
          roles: ['admin'],
          reason: 'ownership probe',
        });
      // Precondition: the caller really does hold the permission — in their
      // own cooperative. The denial below must come from ownership, not from
      // the caller being a nobody.
      expect(
        await testApp.container.membershipReadModel.hasPermissionResult(
          FOREIGN_COOP_DID as DID,
          did as DID,
          'agreement.amend',
        ),
      ).toEqual({ ok: true, allowed: true });

      const res = await agent
        .post('/api/v1/federation/agreement/sign-request')
        .send({
          agreementUri,
          signerDid: did,
          cooperativeDid: FOREIGN_COOP_DID,
        })
        .expect(403);

      expect(res.body.axis).toBe('spaces');
      expect(await signatureRequests(agreementUri, did)).toHaveLength(0);
    });

    it('closes the self-service minting loop into /signature', async () => {
      // The loop the ownership gate exists to break: hold `agreement.amend`
      // in a cooperative you control, point `agreementUri` at somebody else's
      // open agreement and `signerDid` at yourself. Pre-fix the pending row
      // was created (200) and then satisfied `/signature`'s pending-request
      // check (201), minting a binding signature on an agreement nobody had
      // asked this DID to sign.
      const agreementUri = await openAgreement('Minting Loop Target');
      const { agent, did } = await register('looper@authz.test', 'looper');
      await createCooperative(LOOP_COOP_DID, 'Looper Co-op');
      await testApp.container
        .groupMutationsForDb(testApp.container.db)
        .addMember({
          cooperativeDid: LOOP_COOP_DID as DID,
          memberDid: did as DID,
          actorDid: LOOP_COOP_DID as DID,
          roles: ['admin'],
          reason: 'minting loop probe',
        });

      const solicited = await agent
        .post('/api/v1/federation/agreement/sign-request')
        .send({
          agreementUri,
          agreementTitle: 'Please sign (from my own coop)',
          signerDid: did,
          cooperativeDid: LOOP_COOP_DID,
        })
        .expect(403);
      expect(solicited.body.axis).toBe('spaces');
      expect(await signatureRequests(agreementUri, did)).toHaveLength(0);

      // ...and with no pending row to lean on, the second half of the loop is
      // refused too.
      const minted = await agent
        .post('/api/v1/federation/agreement/signature')
        .send({
          agreementUri,
          signerDid: did,
          signatureUri: 'at://did:test/agreement.signature/loop',
          signatureCid: 'bafyloop',
          cooperativeDid: LOOP_COOP_DID,
        })
        .expect(403);
      expect(minted.body.axis).toBe('service-auth');
      expect(await signatures(agreementUri, did)).toHaveLength(0);
    });

    it('rejects an unbounded agreementTitle', async () => {
      await testApp.agent
        .post('/api/v1/federation/agreement/sign-request')
        .send({
          agreementUri: 'at://did:test/agreement/long-title',
          agreementTitle: 'x'.repeat(256),
          signerDid: victimDid,
          cooperativeDid: coopDid,
        })
        .expect(400);
    });

    it('fails closed with 503 when membership authority is degraded', async () => {
      // The actor is deliberately neither the cooperative nor the asserted
      // signer: `callerHasCoopPermission` short-circuits both of those before
      // it ever consults the read model, which would make the spy vacuous.
      const spy = vi
        .spyOn(testApp.container.membershipReadModel, 'hasPermissionResult')
        .mockResolvedValue(
          membershipAuthorityFailure(
            'stale',
            'Membership authority returned stale data',
          ),
        );

      try {
        const res = await attacker
          .post('/api/v1/federation/agreement/sign-request')
          .send({
            agreementUri: 'at://did:test/agreement/degraded',
            signerDid: victimDid,
            cooperativeDid: coopDid,
          })
          .expect(503);

        expect(res.body).toMatchObject({
          error: 'SPACES_AUTHORITY_UNAVAILABLE',
          axis: 'spaces',
          reason: 'stale',
        });
        expect(spy).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }

      expect(
        await signatureRequests('at://did:test/agreement/degraded', victimDid),
      ).toHaveLength(0);
    });
  });

  // ── The signed server-to-server path ──

  describe('signed peer requests', () => {
    const peerDid = 'did:web:peer.authz.test';
    const peerKeyId = `${peerDid}#signingKey`;
    /**
     * The Host these requests are dialled with. Deliberately *not* this
     * instance's configured origin: since N-25 the middleware verifies against
     * `PUBLIC_API_URL` and ignores `Host` entirely, so every signed case below
     * doubles as proof that the header carries no authority.
     */
    const HOST = 'test.local';
    /** `testConfig.PUBLIC_API_URL` in tests/helpers/test-app.ts. */
    const SELF_ORIGIN = 'http://localhost:3001';
    /** Some other instance in the federation. Never this one. */
    const FOREIGN_ORIGIN = 'http://other.example';

    let peerPrivateKey: CryptoKey;
    let peerPublicJwk: Record<string, unknown>;

    beforeAll(async () => {
      const keyPair = await nodeCrypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
      );
      peerPrivateKey = keyPair.privateKey;
      peerPublicJwk = (await nodeCrypto.subtle.exportKey(
        'jwk',
        keyPair.publicKey,
      )) as Record<string, unknown>;
    });

    function peerDidDocument(): DidDocument {
      return {
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: peerDid as DID,
        verificationMethod: [
          {
            id: peerKeyId,
            type: 'JsonWebKey',
            controller: peerDid,
            publicKeyJwk: peerPublicJwk,
          },
        ],
        service: [],
      };
    }

    /**
     * Drives the *signed* branch of `requireFederationAuth`: a session-free
     * supertest instance (a cookie would make the middleware skip verification
     * entirely). The `Host` header is pinned only so the dialled authority is
     * a fixed, known value — since N-25 it does not decide what is verified;
     * `SELF_ORIGIN` does, which is why that is what requests sign for by
     * default.
     */
    async function peerPost(
      path: string,
      body: Record<string, unknown>,
      opts: { signedTargetUri?: string; host?: string } = {},
    ) {
      const bodyStr = JSON.stringify(body);
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      };
      const sigHeaders = await signRequest(
        'POST',
        opts.signedTargetUri ?? `${SELF_ORIGIN}${path}`,
        headers,
        bodyStr,
        peerPrivateKey,
        peerKeyId,
      );

      return supertest(testApp.app)
        .post(path)
        .set('Host', opts.host ?? HOST)
        .set('Content-Type', 'application/json')
        .set('Signature-Input', sigHeaders['Signature-Input'])
        .set('Signature', sigHeaders.Signature)
        .set('Content-Digest', sigHeaders['Content-Digest']!)
        .send(bodyStr);
    }

    it('rejects a signature over the wrong target URI (negative control)', async () => {
      // Without this, a green mismatch test would only prove "some signature
      // verified", not that this rig actually drives the signed path.
      const spy = vi
        .spyOn(testApp.container.didResolver, 'resolve')
        .mockResolvedValue(peerDidDocument());
      try {
        const res = await peerPost(
          '/api/v1/federation/agreement/signature-retract',
          {
            agreementUri: 'at://did:test/agreement/peer-control',
            signerDid: peerDid,
            cooperativeDid: coopDid,
          },
          {
            // Right origin, wrong path — isolates the path half of
            // `@target-uri` from the origin half N-25 covers below.
            signedTargetUri: `${SELF_ORIGIN}/api/v1/federation/agreement/sign-reject`,
          },
        );
        expect(res.status).toBe(401);
      } finally {
        spy.mockRestore();
      }
    });

    it('accepts a correctly signed peer acting as itself (positive control)', async () => {
      const spy = vi
        .spyOn(testApp.container.didResolver, 'resolve')
        .mockResolvedValue(peerDidDocument());
      try {
        const res = await peerPost(
          '/api/v1/federation/agreement/signature-retract',
          {
            agreementUri: 'at://did:test/agreement/peer-self',
            signerDid: peerDid,
            cooperativeDid: coopDid,
          },
        );
        // 404 "no active signature", not 401 and not 403: the signature
        // verified and the identity gate let the peer through as itself.
        expect(res.status).toBe(404);
      } finally {
        spy.mockRestore();
      }
    });

    it('refuses a verified peer asserting somebody else as the signer', async () => {
      const agreementUri = await openAgreement('Peer Mismatch');
      await seedPendingRequest(agreementUri, victimDid);

      const spy = vi
        .spyOn(testApp.container.didResolver, 'resolve')
        .mockResolvedValue(peerDidDocument());
      try {
        const res = await peerPost('/api/v1/federation/agreement/signature', {
          agreementUri,
          signerDid: victimDid,
          signatureUri: 'at://did:test/agreement.signature/peer-forged',
          signatureCid: 'bafypeerforged',
          cooperativeDid: coopDid,
        });

        expect(res.status).toBe(403);
        expect(res.body.axis).toBe('service-auth');
      } finally {
        spy.mockRestore();
      }

      expect(await signatures(agreementUri, victimDid)).toHaveLength(0);
    });

    // ── N-25: the signature must have been made for *this* instance ──

    it('rejects a signature made for another instance and replayed here', async () => {
      // The whole point of requiring `@target-uri` coverage (A-07) is that a
      // signature names the request it authorises. That was a no-op across
      // hosts while the verifier rebuilt the target from the caller's own
      // `Host`: sign for instance A, then send the identical bytes here with
      // `Host: A`, and this instance reconstructs A's URI and agrees.
      //
      // Nothing here is forged — the signature is cryptographically valid and
      // the peer really is who it says it is. It was simply made for somewhere
      // else, and this route mints a legally operative signature row.
      const agreementUri = await openAgreement('Cross-Origin Replay');
      await seedPendingRequest(agreementUri, peerDid);

      const spy = vi
        .spyOn(testApp.container.didResolver, 'resolve')
        .mockResolvedValue(peerDidDocument());
      try {
        const res = await peerPost(
          '/api/v1/federation/agreement/signature',
          {
            agreementUri,
            signerDid: peerDid,
            signatureUri: 'at://did:test/agreement.signature/replayed',
            signatureCid: 'bafyreplayed',
            cooperativeDid: coopDid,
          },
          {
            signedTargetUri: `${FOREIGN_ORIGIN}/api/v1/federation/agreement/signature`,
            host: 'other.example',
          },
        );

        expect(res.status).toBe(401);
        expect(res.body.axis).toBe('service-auth');
        // The message has to separate "signed for somewhere else" from "bad
        // signature", or this is undiagnosable in the field.
        expect(res.body.message).toContain(SELF_ORIGIN);
        expect(res.body.message).toContain('other.example');
      } finally {
        spy.mockRestore();
      }

      // Nothing was written, and the request it would have answered is still
      // open for the real signer.
      expect(await signatures(agreementUri, peerDid)).toHaveLength(0);
      const requests = await signatureRequests(agreementUri, peerDid);
      expect(requests).toHaveLength(1);
      expect(requests[0]!.status).toBe('pending');
    });

    it('accepts the same request signed for this instance, whatever Host it was dialled with', async () => {
      // The positive sibling: identical route, identical peer, identical body
      // — only the origin the signature was made for differs. It reaches the
      // handler and records the signature, so the rejection above cannot be a
      // gate that simply refuses signed traffic.
      //
      // `host` is still the foreign one: the configured origin decides, not
      // the dialled authority, so a peer reaching this instance over a private
      // address or through a proxy still verifies.
      const agreementUri = await openAgreement('Configured Origin');
      await seedPendingRequest(agreementUri, peerDid);

      const spy = vi
        .spyOn(testApp.container.didResolver, 'resolve')
        .mockResolvedValue(peerDidDocument());
      try {
        const res = await peerPost(
          '/api/v1/federation/agreement/signature',
          {
            agreementUri,
            signerDid: peerDid,
            signatureUri: 'at://did:test/agreement.signature/self-origin',
            signatureCid: 'bafyselforigin',
            cooperativeDid: coopDid,
          },
          { host: 'other.example' },
        );

        expect(res.status).toBe(201);
        expect(res.body.recorded).toBe(true);
      } finally {
        spy.mockRestore();
      }

      const rows = await signatures(agreementUri, peerDid);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.uri).toBe('at://did:test/agreement.signature/self-origin');
    });

    it('refuses to construct at all when the configured origin cannot be bound', () => {
      // "Never falls back" is the security core of N-25, and it only holds
      // because this is a *construction-time* throw: `createFederationRoutes`
      // runs while the Express app is built, so a value the middleware cannot
      // bind to takes the process down at boot instead of quietly degrading to
      // the request's own authority on some later request. The config schema
      // rejects these too, but `tests/helpers/test-app.ts` builds an
      // `AppConfig` by cast and never runs Zod — so this is the check that
      // actually holds at the point of use.
      const resolver = testApp.container.didResolver;

      // Parses fine; `new URL('file:///x').origin` is the literal string
      // 'null', which would become a target URI no signature could match.
      expect(() => requireFederationAuth(resolver, 'file:///x')).toThrow(
        /no http\(s\) origin/,
      );
      expect(() => requireFederationAuth(resolver, 'not-a-url')).toThrow(
        /is not a valid URL/,
      );
      expect(() => requireFederationAuth(resolver, '')).toThrow(
        /is not a valid URL/,
      );

      // Positive sibling: a bindable value (trailing slash and all) builds a
      // handler rather than throwing, so the assertions above cannot be a
      // factory that simply refuses everything.
      expect(
        typeof requireFederationAuth(resolver, 'http://localhost:3001/'),
      ).toBe('function');
    });
  });

  // ── Authorization matrix ──

  describe('authorization matrix', () => {
    // Roles only decide `sign-request`; the other four routes turn on identity,
    // and their mismatch/positive pairs are covered above one route at a time.
    const ROLE_CASES: ReadonlyArray<{
      readonly label: string;
      readonly roles: readonly string[];
      readonly expected: number;
    }> = [
      { label: 'owner', roles: ['owner'], expected: 200 },
      { label: 'admin', roles: ['admin'], expected: 200 },
      { label: 'coordinator', roles: ['coordinator'], expected: 200 },
      { label: 'member', roles: ['member'], expected: 403 },
      { label: 'observer', roles: ['observer'], expected: 403 },
    ];

    let otherCoopDid: string;

    beforeAll(async () => {
      otherCoopDid = 'did:plc:otherauthzcoop';
      await createCooperative(otherCoopDid, 'Other Cooperative');
    });

    /** Detach a registered user from the cooperative entirely. */
    async function dropMembership(memberDid: string): Promise<void> {
      const rows = await testApp.container.db
        .selectFrom('membership')
        .where('member_did', '=', memberDid)
        .where('cooperative_did', '=', coopDid)
        .select('id')
        .execute();
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return;
      await testApp.container.db
        .deleteFrom('membership_role')
        .where('membership_id', 'in', ids)
        .execute();
      await testApp.container.db
        .deleteFrom('membership')
        .where('id', 'in', ids)
        .execute();
    }

    it.each(ROLE_CASES)(
      'sign-request from a $label returns $expected',
      async ({ label, roles, expected }) => {
        const { agent, did } = await register(
          `matrix-${label}@authz.test`,
          `matrix${label}`,
        );
        await testApp.container
          .groupMutationsForDb(testApp.container.db)
          .setMemberRoles({
            cooperativeDid: coopDid as DID,
            memberDid: did as DID,
            actorDid: victimDid as DID,
            roles: [...roles],
          });

        const res = await agent
          .post('/api/v1/federation/agreement/sign-request')
          .send({
            agreementUri: await openAgreement(`Matrix ${label}`),
            signerDid: victimDid,
            cooperativeDid: coopDid,
          });

        expect(res.status).toBe(expected);
        if (expected === 403) expect(res.body.axis).toBe('spaces');
      },
    );

    it('sign-request from a suspended coordinator returns 403', async () => {
      const { agent, did } = await register(
        'matrix-suspended@authz.test',
        'matrixsuspended',
      );
      const mutations = testApp.container.groupMutationsForDb(
        testApp.container.db,
      );
      await mutations.setMemberRoles({
        cooperativeDid: coopDid as DID,
        memberDid: did as DID,
        actorDid: victimDid as DID,
        roles: ['coordinator'],
      });
      await mutations.suspendMember({
        cooperativeDid: coopDid as DID,
        memberDid: did as DID,
        actorDid: victimDid as DID,
        reason: 'authz matrix',
      });

      const res = await agent
        .post('/api/v1/federation/agreement/sign-request')
        .send({
          agreementUri: await openAgreement('Matrix Suspended'),
          signerDid: victimDid,
          cooperativeDid: coopDid,
        })
        .expect(403);
      expect(res.body.axis).toBe('spaces');
    });

    it('sign-request from a removed coordinator returns 403', async () => {
      const { agent, did } = await register(
        'matrix-removed@authz.test',
        'matrixremoved',
      );
      const mutations = testApp.container.groupMutationsForDb(
        testApp.container.db,
      );
      await mutations.setMemberRoles({
        cooperativeDid: coopDid as DID,
        memberDid: did as DID,
        actorDid: victimDid as DID,
        roles: ['coordinator'],
      });
      await mutations.removeMember({
        cooperativeDid: coopDid as DID,
        memberDid: did as DID,
        actorDid: victimDid as DID,
        reason: 'authz matrix',
      });

      const res = await agent
        .post('/api/v1/federation/agreement/sign-request')
        .send({
          agreementUri: await openAgreement('Matrix Removed'),
          signerDid: victimDid,
          cooperativeDid: coopDid,
        })
        .expect(403);
      expect(res.body.axis).toBe('spaces');
    });

    it('sign-request from a non-member session holder returns 403', async () => {
      const { agent, did } = await register(
        'matrix-nonmember@authz.test',
        'matrixnonmember',
      );
      await dropMembership(did);

      const res = await agent
        .post('/api/v1/federation/agreement/sign-request')
        .send({
          agreementUri: await openAgreement('Matrix Non-member'),
          signerDid: victimDid,
          cooperativeDid: coopDid,
        })
        .expect(403);
      expect(res.body.axis).toBe('spaces');
    });

    it('sign-request from an admin of a different cooperative returns 403', async () => {
      // Authority is per-cooperative. Holding `agreement.amend` somewhere else
      // must not reach into this cooperative's signature requests.
      const { agent, did } = await register(
        'matrix-wrongcoop@authz.test',
        'matrixwrongcoop',
      );
      await dropMembership(did);
      await testApp.container
        .groupMutationsForDb(testApp.container.db)
        .addMember({
          cooperativeDid: otherCoopDid as DID,
          memberDid: did as DID,
          actorDid: otherCoopDid as DID,
          roles: ['admin'],
          reason: 'authz matrix',
        });
      // Without this the actor would be a nobody everywhere and the denial
      // below would prove nothing about authority failing to travel.
      expect(
        await testApp.container.membershipReadModel.hasPermissionResult(
          otherCoopDid as DID,
          did as DID,
          'agreement.amend',
        ),
      ).toEqual({ ok: true, allowed: true });

      const res = await agent
        .post('/api/v1/federation/agreement/sign-request')
        .send({
          agreementUri: await openAgreement('Matrix Wrong Coop'),
          signerDid: victimDid,
          cooperativeDid: coopDid,
        })
        .expect(403);
      expect(res.body.axis).toBe('spaces');
    });

    it('sign-request against an unknown agreement URI returns 403, not 404', async () => {
      // Replaces a signer-membership case whose rule no longer exists (its
      // negative now lives in "does not own", its positive in the inter-coop
      // test). What is worth pinning here is the disclosure choice: a caller
      // with authority over one cooperative gets the same 403 for "no such
      // agreement" as for "not yours", so this is not an existence oracle
      // over every agreement URI on the instance.
      const outsider = 'did:plc:authzoutsider';
      const unknownUri = 'at://did:test/agreement/matrix-unknown';
      const res = await testApp.agent
        .post('/api/v1/federation/agreement/sign-request')
        .send({
          agreementUri: unknownUri,
          signerDid: outsider,
          cooperativeDid: coopDid,
        })
        .expect(403);

      expect(res.body.axis).toBe('spaces');
      // Asserted so this pins the ownership gate specifically: the removed
      // membership rule also answered 403/'spaces' here, just with a different
      // message, so status and axis alone would not have caught the swap.
      expect(res.body.message).toMatch(/does not belong to the cooperative/);
      expect(await signatureRequests(unknownUri, outsider)).toHaveLength(0);
    });
  });
});
