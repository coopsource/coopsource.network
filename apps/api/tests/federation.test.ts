import { describe, it, expect, beforeAll } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';

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
  });

  describe('POST /api/v1/federation/membership/approve', () => {
    it('succeeds when called from a local user session (skips signature check)', async () => {
      // In standalone mode with a session, requireFederationAuth skips.
      // This creates a memberApproval PDS record locally.
      const res = await testApp.agent
        .post('/api/v1/federation/membership/approve')
        .send({
          cooperativeDid: coopDid,
          memberDid: adminDid,
          roles: ['member'],
        })
        .expect(201);

      expect(res.body.approvalRecordUri).toBeDefined();
      expect(res.body.approvalRecordCid).toBeDefined();
    });

    it('validates request body', async () => {
      await testApp.agent
        .post('/api/v1/federation/membership/approve')
        .send({ cooperativeDid: coopDid })
        .expect(400);
    });
  });

  describe('POST /api/v1/federation/membership/request', () => {
    it('creates membership record via session auth', async () => {
      const res = await testApp.agent
        .post('/api/v1/federation/membership/request')
        .send({
          memberDid: adminDid,
          cooperativeDid: coopDid,
        })
        .expect(201);

      expect(res.body.memberRecordUri).toBeDefined();
      expect(res.body.memberRecordCid).toBeDefined();
    });
  });

  describe('POST /api/v1/federation/hub/register', () => {
    it('registers a cooperative peer', async () => {
      const res = await testApp.agent
        .post('/api/v1/federation/hub/register')
        .send({
          cooperativeDid: coopDid,
          hubUrl: 'http://localhost:3001',
          metadata: {
            displayName: 'Test Cooperative',
          },
        })
        .expect(200);

      expect(res.body.registered).toBe(true);
      expect(res.body.did).toBe(coopDid);
    });

    it('upserts on re-registration', async () => {
      const res = await testApp.agent
        .post('/api/v1/federation/hub/register')
        .send({
          cooperativeDid: coopDid,
          hubUrl: 'http://localhost:3001',
          metadata: {
            displayName: 'Updated Name',
            description: 'Updated description',
          },
        })
        .expect(200);

      expect(res.body.registered).toBe(true);

      // Verify the peer was updated
      const peer = await testApp.container.db
        .selectFrom('federation_peer')
        .where('did', '=', coopDid)
        .selectAll()
        .executeTakeFirst();

      expect(peer).toBeDefined();
      expect(peer!.display_name).toBe('Updated Name');
      expect(peer!.description).toBe('Updated description');
    });

    it('validates request body', async () => {
      await testApp.agent
        .post('/api/v1/federation/hub/register')
        .send({ cooperativeDid: coopDid })
        .expect(400);
    });
  });

  describe('POST /api/v1/federation/hub/notify', () => {
    it('acknowledges a valid event', async () => {
      const res = await testApp.agent
        .post('/api/v1/federation/hub/notify')
        .send({
          type: 'membership.approved',
          sourceDid: coopDid,
          data: { memberDid: adminDid },
          timestamp: new Date().toISOString(),
        })
        .expect(200);

      expect(res.body.acknowledged).toBe(true);
      expect(res.body.eventType).toBe('membership.approved');
    });

    it('validates request body', async () => {
      await testApp.agent
        .post('/api/v1/federation/hub/notify')
        .send({ type: 'membership.approved' })
        .expect(400);
    });
  });

  // ─── Agreement signing federation ──────────────────────────────────

  describe('Agreement signing federation', () => {
    let agreementUri: string;

    beforeAll(async () => {
      // Create an agreement and open it for signing
      const agreement = await testApp.container.agreementService.createAgreement(
        adminDid,
        coopDid,
        {
          title: 'Test Federation Agreement',
          agreementType: 'operating',
        },
      );
      agreementUri = agreement.uri;
      await testApp.container.agreementService.openAgreement(agreementUri, adminDid);
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
        expect(request!.signature_uri).toBe('at://did:test/agreement.signature/1');
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
        const agreement2 = await testApp.container.agreementService.createAgreement(
          adminDid,
          coopDid,
          { title: 'To Be Voided', agreementType: 'operating' },
        );
        await testApp.container.agreementService.openAgreement(agreement2.uri, adminDid);

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
        await testApp.container.agreementService.voidAgreement(agreement2.uri, adminDid);

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
        const draftAgreement = await testApp.container.agreementService.createAgreement(
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
        (r: { agreementUri: string }) => r.agreementUri === 'at://did:test/agreement/expired',
      );
      expect(expired).toBeUndefined();
    });

    it('requires authentication', async () => {
      // Make a request without session
      const { createTestApp: createFreshApp } = await import('./helpers/test-app.js');
      const freshApp = createFreshApp();
      await freshApp.agent
        .get('/api/v1/me/signature-requests')
        .expect(401);
    });
  });

  // ─── Outbox ─────────────────────────────────────────────────────────

  describe('Federation outbox', () => {
    it('enqueue creates a pending message', async () => {
      const { enqueueOutboxMessage } = await import('@coopsource/federation');

      const id = await enqueueOutboxMessage(testApp.container.db, {
        targetDid: 'did:web:remote.example.com',
        targetUrl: 'http://remote.example.com',
        endpoint: '/api/v1/federation/hub/notify',
        payload: { type: 'test', data: {} },
      });

      expect(id).toBeDefined();

      const msg = await testApp.container.db
        .selectFrom('federation_outbox')
        .where('id', '=', id)
        .selectAll()
        .executeTakeFirst();

      expect(msg).toBeDefined();
      expect(msg!.status).toBe('pending');
      expect(msg!.target_did).toBe('did:web:remote.example.com');
      expect(msg!.attempts).toBe(0);
    });

    it('idempotency key prevents duplicates', async () => {
      const { enqueueOutboxMessage } = await import('@coopsource/federation');

      await enqueueOutboxMessage(testApp.container.db, {
        targetDid: 'did:web:remote.example.com',
        targetUrl: 'http://remote.example.com',
        endpoint: '/api/v1/federation/hub/notify',
        payload: { type: 'dedup-test', data: {} },
        idempotencyKey: 'unique-key-123',
      });

      // Second enqueue with same key should fail
      await expect(
        enqueueOutboxMessage(testApp.container.db, {
          targetDid: 'did:web:remote.example.com',
          targetUrl: 'http://remote.example.com',
          endpoint: '/api/v1/federation/hub/notify',
          payload: { type: 'dedup-test-2', data: {} },
          idempotencyKey: 'unique-key-123',
        }),
      ).rejects.toThrow();
    });
  });
});
