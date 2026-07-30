import { describe, it, expect, beforeAll, vi } from 'vitest';
import supertest from 'supertest';
import type { DID } from '@coopsource/common';
import { truncateAllTables } from './helpers/test-db.js';
import {
  createTestApp,
  setupAndLogin,
  type TestApp,
} from './helpers/test-app.js';
import { membershipAuthorityFailure } from '../src/services/membership-read-model.js';

const MEMBER_CONSENT_COLLECTION = 'network.coopsource.org.memberConsent';

describe('Federation endpoints', () => {
  let testApp: TestApp;
  let coopDid: string;
  let adminDid: string;

  beforeAll(async () => {
    await truncateAllTables();
    testApp = createTestApp();
    const result = await setupAndLogin(testApp);
    coopDid = result.coopDid;
    adminDid = result.adminDid;
  });

  describe('GET /api/v1/federation/entity/:did', () => {
    it('returns entity info for a valid DID', async () => {
      const res = await testApp.agent
        .get(`/api/v1/federation/entity/${encodeURIComponent(coopDid)}`)
        .expect(200);

      expect(res.body.did).toBe(coopDid);
      expect(res.body.displayName).toBe('Test Cooperative');
      expect(res.body.type).toBe('cooperative');
      expect(res.body.status).toBe('active');
    });

    it('returns entity info for admin DID', async () => {
      const res = await testApp.agent
        .get(`/api/v1/federation/entity/${encodeURIComponent(adminDid)}`)
        .expect(200);

      expect(res.body.did).toBe(adminDid);
      expect(res.body.type).toBe('person');
    });

    it('returns 404 for unknown DID', async () => {
      await testApp.agent
        .get('/api/v1/federation/entity/did%3Aweb%3Aunknown.example.com')
        .expect(404);
    });
  });

  describe('GET /api/v1/federation/coop/:did/profile', () => {
    it('returns coop profile for a cooperative DID', async () => {
      const res = await testApp.agent
        .get(`/api/v1/federation/coop/${encodeURIComponent(coopDid)}/profile`)
        .expect(200);

      expect(res.body.did).toBe(coopDid);
      expect(res.body.displayName).toBe('Test Cooperative');
      expect(res.body.cooperativeType).toBeDefined();
      expect(res.body.membershipPolicy).toBeDefined();
      expect(typeof res.body.memberCount).toBe('number');
    });

    it('returns 404 for unknown DID', async () => {
      await testApp.agent
        .get('/api/v1/federation/coop/did%3Aweb%3Aunknown.example.com/profile')
        .expect(404);
    });

    it('returns 404 for non-cooperative entity (person)', async () => {
      await testApp.agent
        .get(`/api/v1/federation/coop/${encodeURIComponent(adminDid)}/profile`)
        .expect(404);
    });

    it('surfaces degraded spaces authority while computing member count', async () => {
      const spy = vi
        .spyOn(
          testApp.container.membershipReadModel,
          'countActiveMembersResult',
        )
        .mockResolvedValue(
          membershipAuthorityFailure(
            'partial',
            'Membership authority returned a partial result',
          ),
        );

      try {
        const res = await testApp.agent
          .get(`/api/v1/federation/coop/${encodeURIComponent(coopDid)}/profile`)
          .expect(503);

        expect(res.body).toMatchObject({
          error: 'SPACES_AUTHORITY_UNAVAILABLE',
          axis: 'spaces',
          reason: 'partial',
        });
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('POST /api/v1/federation/membership/approve', () => {
    it('succeeds when called from a local user session (skips signature check)', async () => {
      // In standalone mode with a session, requireFederationAuth skips.
      // V11 routes membership authority through the group mutation port.
      const consent = await writeConsentRecord(testApp, {
        authorDid: adminDid,
        cooperativeDid: coopDid,
        consentType: 'joinRequest',
        rkey: 'approve-test',
      });

      const res = await testApp.agent
        .post('/api/v1/federation/membership/approve')
        .send({
          cooperativeDid: coopDid,
          memberDid: adminDid,
          consentRecordUri: consent.uri,
          consentRecordCid: consent.cid,
          roles: ['member'],
        })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.changed).toBe(true);
      expect(res.body.auditEventId).toBeDefined();
    });

    it('validates request body', async () => {
      await testApp.agent
        .post('/api/v1/federation/membership/approve')
        .send({ cooperativeDid: coopDid })
        .expect(400);
    });

    it('rejects approval from a caller without authority over the cooperative (Axis 2)', async () => {
      // A second user who self-registers is only a plain member — not an
      // owner/admin — of the cooperative. They must not be able to approve
      // members (and grant elevated roles) into a coop they do not manage.
      const attacker = supertest.agent(testApp.app);
      await attacker
        .post('/api/v1/auth/register')
        .send({
          email: 'mallory@test.com',
          password: 'password123',
          displayName: 'Mallory',
        })
        .expect(201);

      const res = await attacker
        .post('/api/v1/federation/membership/approve')
        .send({
          cooperativeDid: coopDid,
          memberDid: 'did:plc:victim',
          consentRecordUri:
            'at://did:plc:victim/network.coopsource.org.memberConsent/x',
          consentRecordCid: 'bafyreiabc',
          roles: ['roles/board', 'roles/treasurer'],
        })
        .expect(403);

      expect(res.body.axis).toBe('spaces');
    });

    it('surfaces degraded spaces authority before approving membership', async () => {
      const spy = vi
        .spyOn(testApp.container.membershipReadModel, 'hasPermissionResult')
        .mockResolvedValue(
          membershipAuthorityFailure(
            'stale',
            'Membership authority returned stale data',
          ),
        );

      try {
        const res = await testApp.agent
          .post('/api/v1/federation/membership/approve')
          .send({
            cooperativeDid: coopDid,
            memberDid: 'did:plc:victim',
            consentRecordUri:
              'at://did:plc:victim/network.coopsource.org.memberConsent/x',
            consentRecordCid: 'bafyreiabc',
            roles: ['member'],
          })
          .expect(503);

        expect(res.body).toMatchObject({
          error: 'SPACES_AUTHORITY_UNAVAILABLE',
          axis: 'spaces',
          reason: 'stale',
        });
      } finally {
        spy.mockRestore();
      }
    });

    it('authorizes a non-admin caller who holds member.approve via their role (coordinator)', async () => {
      // Authority is the member.approve *permission*, not a hardcoded role
      // list — so a coordinator (who has member.approve but is not admin/owner)
      // must be able to approve, and the admin promotes them via the port.
      const coordinator = supertest.agent(testApp.app);
      const reg = await coordinator
        .post('/api/v1/auth/register')
        .send({
          email: 'coord@test.com',
          password: 'password123',
          displayName: 'Coordinator',
        })
        .expect(201);
      // Admin (this suite's logged-in agent) grants the coordinator role.
      const mut = testApp.container.groupMutationsForDb(testApp.container.db);
      await mut.setMemberRoles({
        cooperativeDid: coopDid as DID,
        memberDid: reg.body.did as DID,
        actorDid: adminDid as DID,
        roles: ['coordinator'],
      });

      const target = await writeConsentRecord(testApp, {
        authorDid: adminDid,
        cooperativeDid: coopDid,
        consentType: 'joinRequest',
        rkey: 'coord-approve',
      });
      const res = await coordinator
        .post('/api/v1/federation/membership/approve')
        .send({
          cooperativeDid: coopDid,
          memberDid: adminDid,
          consentRecordUri: target.uri,
          consentRecordCid: target.cid,
          roles: ['member'],
        })
        .expect(201);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('POST /api/v1/federation/membership/request', () => {
    it('echoes verified caller-supplied member consent evidence via session auth', async () => {
      const consent = await writeConsentRecord(testApp, {
        authorDid: adminDid,
        cooperativeDid: coopDid,
        consentType: 'joinRequest',
        rkey: 'request-test',
      });

      const res = await testApp.agent
        .post('/api/v1/federation/membership/request')
        .send({
          memberDid: adminDid,
          cooperativeDid: coopDid,
          consentRecordUri: consent.uri,
          consentRecordCid: consent.cid,
        })
        .expect(201);

      expect(res.body.consentRecordUri).toBe(consent.uri);
      expect(res.body.consentRecordCid).toBe(consent.cid);
    });

    it('rejects consent evidence with a mismatched CID', async () => {
      const consent = await writeConsentRecord(testApp, {
        authorDid: adminDid,
        cooperativeDid: coopDid,
        consentType: 'joinRequest',
        rkey: 'bad-cid-test',
      });

      await testApp.agent
        .post('/api/v1/federation/membership/request')
        .send({
          memberDid: adminDid,
          cooperativeDid: coopDid,
          consentRecordUri: consent.uri,
          consentRecordCid: 'bafywrong',
        })
        .expect(400);
    });
  });

  describe('POST /api/v1/federation/hub/register', () => {
    it('returns 501 NotImplemented (V3 deprecated)', async () => {
      const res = await testApp.agent
        .post('/api/v1/federation/hub/register')
        .send({
          cooperativeDid: coopDid,
          hubUrl: 'http://localhost:3001',
          metadata: { displayName: 'Test Cooperative' },
        })
        .expect(501);

      expect(res.body.error).toBe('NotImplemented');
    });
  });

  describe('POST /api/v1/federation/hub/notify', () => {
    it('returns 501 NotImplemented (V3 deprecated)', async () => {
      const res = await testApp.agent
        .post('/api/v1/federation/hub/notify')
        .send({
          type: 'membership.approved',
          sourceDid: coopDid,
          data: {},
        })
        .expect(501);

      expect(res.body.error).toBe('NotImplemented');
    });
  });

  // ─── Agreement signing federation ──────────────────────────────────

  describe('Agreement signing federation', () => {
    let agreementUri: string;

    beforeAll(async () => {
      // Create an agreement and open it for signing
      const agreement =
        await testApp.container.agreementService.createAgreement(
          adminDid,
          coopDid,
          {
            title: 'Test Federation Agreement',
            agreementType: 'operating',
          },
        );
      agreementUri = agreement.uri;
      await testApp.container.agreementService.openAgreement(
        agreementUri,
        adminDid,
      );
    });

    describe('POST /api/v1/federation/agreement/sign-request', () => {
      it('creates a signature request for a known signer', async () => {
        const res = await testApp.agent
          .post('/api/v1/federation/agreement/sign-request')
          .send({
            agreementUri,
            agreementTitle: 'Test Federation Agreement',
            signerDid: adminDid,
            cooperativeDid: coopDid,
          })
          .expect(200);

        expect(res.body.acknowledged).toBe(true);
        expect(res.body.requestId).toBeDefined();
        expect(res.body.expiresAt).toBeDefined();
      });

      it('returns 409 for duplicate pending request', async () => {
        await testApp.agent
          .post('/api/v1/federation/agreement/sign-request')
          .send({
            agreementUri,
            signerDid: adminDid,
            cooperativeDid: coopDid,
          })
          .expect(409);
      });

      it('returns 404 for unknown signer', async () => {
        await testApp.agent
          .post('/api/v1/federation/agreement/sign-request')
          .send({
            agreementUri,
            signerDid: 'did:web:nonexistent.example.com',
            cooperativeDid: coopDid,
          })
          .expect(404);
      });

      it('validates request body', async () => {
        await testApp.agent
          .post('/api/v1/federation/agreement/sign-request')
          .send({ agreementUri })
          .expect(400);
      });
    });

    describe('POST /api/v1/federation/agreement/signature', () => {
      it('records a signature on an open agreement', async () => {
        const res = await testApp.agent
          .post('/api/v1/federation/agreement/signature')
          .send({
            agreementUri,
            signerDid: adminDid,
            signatureUri: 'at://did:test/agreement.signature/1',
            signatureCid: 'bafytest123',
            cooperativeDid: coopDid,
            statement: 'I agree',
          })
          .expect(201);

        expect(res.body.recorded).toBe(true);
        expect(res.body.signatureId).toBeDefined();

        // Verify the signature_request was updated to 'signed'
        const request = await testApp.container.db
          .selectFrom('signature_request')
          .where('agreement_uri', '=', agreementUri)
          .where('signer_did', '=', adminDid)
          .where('status', '=', 'signed')
          .select(['status', 'signature_uri'])
          .executeTakeFirst();

        expect(request).toBeDefined();
        expect(request!.signature_uri).toBe(
          'at://did:test/agreement.signature/1',
        );
      });

      it('returns 404 for unknown agreement', async () => {
        await testApp.agent
          .post('/api/v1/federation/agreement/signature')
          .send({
            agreementUri: 'at://did:test/nonexistent/1',
            signerDid: adminDid,
            signatureUri: 'at://did:test/sig/2',
            signatureCid: 'bafytest456',
            cooperativeDid: coopDid,
          })
          .expect(404);
      });

      it('returns 409 for duplicate signature', async () => {
        await testApp.agent
          .post('/api/v1/federation/agreement/signature')
          .send({
            agreementUri,
            signerDid: adminDid,
            signatureUri: 'at://did:test/agreement.signature/dup',
            signatureCid: 'bafyduptest',
            cooperativeDid: coopDid,
          })
          .expect(409);
      });
    });

    describe('POST /api/v1/federation/agreement/signature-retract', () => {
      it('retracts an existing signature', async () => {
        const res = await testApp.agent
          .post('/api/v1/federation/agreement/signature-retract')
          .send({
            agreementUri,
            signerDid: adminDid,
            cooperativeDid: coopDid,
            reason: 'Changed my mind',
          })
          .expect(200);

        expect(res.body.acknowledged).toBe(true);

        // Verify signature_request was updated to 'retracted'
        const request = await testApp.container.db
          .selectFrom('signature_request')
          .where('agreement_uri', '=', agreementUri)
          .where('signer_did', '=', adminDid)
          .where('status', '=', 'retracted')
          .select('status')
          .executeTakeFirst();

        expect(request).toBeDefined();
      });

      it('returns 404 when no active signature', async () => {
        await testApp.agent
          .post('/api/v1/federation/agreement/signature-retract')
          .send({
            agreementUri,
            signerDid: adminDid,
            cooperativeDid: coopDid,
          })
          .expect(404);
      });
    });

    describe('Re-request after resolution', () => {
      it('allows a new sign-request after previous was retracted', async () => {
        // The previous request was retracted; partial unique allows a new pending
        const res = await testApp.agent
          .post('/api/v1/federation/agreement/sign-request')
          .send({
            agreementUri,
            signerDid: adminDid,
            cooperativeDid: coopDid,
          })
          .expect(200);

        expect(res.body.acknowledged).toBe(true);
      });
    });

    describe('POST /api/v1/federation/agreement/sign-reject', () => {
      it('rejects a pending signature request', async () => {
        const res = await testApp.agent
          .post('/api/v1/federation/agreement/sign-reject')
          .send({
            agreementUri,
            signerDid: adminDid,
            cooperativeDid: coopDid,
            reason: 'Not interested',
          })
          .expect(200);

        expect(res.body.acknowledged).toBe(true);
      });

      it('returns 404 when no pending request', async () => {
        await testApp.agent
          .post('/api/v1/federation/agreement/sign-reject')
          .send({
            agreementUri,
            signerDid: adminDid,
            cooperativeDid: coopDid,
          })
          .expect(404);
      });
    });

    describe('POST /api/v1/federation/agreement/sign-cancel', () => {
      it('cancels a pending signature request', async () => {
        // Create a new request to cancel
        await testApp.agent
          .post('/api/v1/federation/agreement/sign-request')
          .send({
            agreementUri,
            signerDid: adminDid,
            cooperativeDid: coopDid,
          })
          .expect(200);

        const res = await testApp.agent
          .post('/api/v1/federation/agreement/sign-cancel')
          .send({
            agreementUri,
            signerDid: adminDid,
            cooperativeDid: coopDid,
            reason: 'No longer needed',
          })
          .expect(200);

        expect(res.body.acknowledged).toBe(true);
      });

      it('returns 404 for already resolved request', async () => {
        await testApp.agent
          .post('/api/v1/federation/agreement/sign-cancel')
          .send({
            agreementUri,
            signerDid: adminDid,
            cooperativeDid: coopDid,
          })
          .expect(404);
      });
    });

    describe('Agreement voiding cascade', () => {
      it('cancels pending requests when agreement is voided', async () => {
        // Create a new agreement with a pending request
        const agreement2 =
          await testApp.container.agreementService.createAgreement(
            adminDid,
            coopDid,
            { title: 'To Be Voided', agreementType: 'operating' },
          );
        await testApp.container.agreementService.openAgreement(
          agreement2.uri,
          adminDid,
        );

        // Create a pending signature request
        await testApp.agent
          .post('/api/v1/federation/agreement/sign-request')
          .send({
            agreementUri: agreement2.uri,
            signerDid: adminDid,
            cooperativeDid: coopDid,
          })
          .expect(200);

        // Void the agreement
        await testApp.container.agreementService.voidAgreement(
          agreement2.uri,
          adminDid,
        );

        // Verify the pending request was cancelled
        const request = await testApp.container.db
          .selectFrom('signature_request')
          .where('agreement_uri', '=', agreement2.uri)
          .where('signer_did', '=', adminDid)
          .select(['status', 'response_message'])
          .executeTakeFirst();

        expect(request).toBeDefined();
        expect(request!.status).toBe('cancelled');
        expect(request!.response_message).toBe('Agreement voided');
      });
    });

    describe('Non-open agreement rejection', () => {
      it('returns 400 for signature on non-open agreement', async () => {
        // Create a draft agreement (not opened)
        const draftAgreement =
          await testApp.container.agreementService.createAgreement(
            adminDid,
            coopDid,
            { title: 'Draft Only', agreementType: 'operating' },
          );

        await testApp.agent
          .post('/api/v1/federation/agreement/signature')
          .send({
            agreementUri: draftAgreement.uri,
            signerDid: adminDid,
            signatureUri: 'at://did:test/sig/draft',
            signatureCid: 'bafydraft',
            cooperativeDid: coopDid,
          })
          .expect(400);
      });
    });
  });

  // ─── Signature requests user endpoint ──────────────────────────────

  describe('GET /api/v1/me/signature-requests', () => {
    it('returns pending requests for the authenticated user', async () => {
      const res = await testApp.agent
        .get('/api/v1/me/signature-requests')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      // All requests created above should be resolved by now, so check structure
      for (const req of res.body) {
        expect(req).toHaveProperty('id');
        expect(req).toHaveProperty('agreementUri');
        expect(req).toHaveProperty('cooperativeDid');
        expect(req).toHaveProperty('requestedAt');
        expect(req).toHaveProperty('expiresAt');
      }
    });

    it('excludes expired requests', async () => {
      // Create an already-expired request
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1000);
      await testApp.container.db
        .insertInto('signature_request')
        .values({
          agreement_uri: 'at://did:test/agreement/expired',
          signer_did: adminDid,
          cooperative_did: coopDid,
          requester_did: coopDid,
          status: 'pending',
          requested_at: pastDate,
          expires_at: pastDate,
          created_at: pastDate,
        })
        .execute();

      const res = await testApp.agent
        .get('/api/v1/me/signature-requests')
        .expect(200);

      // The expired request should not appear
      const expired = res.body.find(
        (r: { agreementUri: string }) =>
          r.agreementUri === 'at://did:test/agreement/expired',
      );
      expect(expired).toBeUndefined();
    });

    it('requires authentication', async () => {
      // Make a request without session
      const { createTestApp: createFreshApp } =
        await import('./helpers/test-app.js');
      const freshApp = createFreshApp();
      await freshApp.agent.get('/api/v1/me/signature-requests').expect(401);
    });
  });
});

async function writeConsentRecord(
  testApp: TestApp,
  args: {
    readonly authorDid: string;
    readonly cooperativeDid: string;
    readonly consentType:
      | 'joinRequest'
      | 'invitationAcceptance'
      | 'bootstrapOwner'
      | 'networkJoin';
    readonly rkey: string;
  },
): Promise<{ readonly uri: string; readonly cid: string }> {
  const ref = await testApp.container.pdsService.putRecord({
    did: args.authorDid as DID,
    collection: MEMBER_CONSENT_COLLECTION,
    rkey: args.rkey,
    record: {
      cooperative: args.cooperativeDid,
      consentType: args.consentType,
      createdAt: testApp.clock.nowIso(),
    },
  });
  return ref;
}
