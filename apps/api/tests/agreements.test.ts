import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import type { TestApp } from './helpers/test-app.js';

describe('Agreements & Signatures', () => {
  let testApp: TestApp;
  let coopDid: string;
  let adminDid: string;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
    const result = await setupAndLogin(testApp);
    coopDid = result.coopDid;
    adminDid = result.adminDid;
  });

  // ─── Helper: create a draft agreement ───────────────────────────────

  function createDraft(overrides: Record<string, unknown> = {}) {
    return testApp.agent
      .post('/api/v1/agreements')
      .send({
        title: 'Code of Conduct',
        body: 'All members shall treat each other with respect.',
        agreementType: 'governance',
        ...overrides,
      });
  }

  // ─── 1. Create draft agreement ──────────────────────────────────────

  it('POST /api/v1/agreements creates a draft agreement (201, camelCase)', async () => {
    const res = await createDraft().expect(201);

    expect(res.body.id).toBeTruthy();
    expect(res.body.title).toBe('Code of Conduct');
    expect(res.body.body).toBe('All members shall treat each other with respect.');
    expect(res.body.agreementType).toBe('governance');
    expect(res.body.status).toBe('draft');
    expect(res.body.authorDid).toBe(adminDid);
    expect(res.body.authorDisplayName).toBe('Test Admin');
    expect(res.body.authorHandle).toBeDefined();
    expect(res.body.signatureCount).toBe(0);
    expect(res.body.mySignature).toBe(false);
    expect(res.body.createdAt).toBeTruthy();
  });

  // ─── 2. List agreements ─────────────────────────────────────────────

  it('GET /api/v1/agreements returns { agreements, cursor }', async () => {
    await createDraft({ title: 'Agreement A' }).expect(201);
    testApp.clock.advance(1000);
    await createDraft({ title: 'Agreement B' }).expect(201);

    const res = await testApp.agent.get('/api/v1/agreements').expect(200);

    expect(res.body.agreements).toHaveLength(2);
    expect(res.body.cursor).toBeNull();

    // Most recent first (descending order)
    expect(res.body.agreements[0].title).toBe('Agreement B');
    expect(res.body.agreements[1].title).toBe('Agreement A');
  });

  // ─── 3. Get agreement by ID ─────────────────────────────────────────

  it('GET /api/v1/agreements/:id returns agreement with signatureCount and mySignature', async () => {
    const createRes = await createDraft().expect(201);
    const id = createRes.body.id;

    const res = await testApp.agent.get(`/api/v1/agreements/${id}`).expect(200);

    expect(res.body.id).toBe(id);
    expect(res.body.title).toBe('Code of Conduct');
    expect(res.body.signatureCount).toBe(0);
    expect(res.body.mySignature).toBe(false);
    expect(res.body.authorDid).toBe(adminDid);
  });

  // ─── 4. Update draft agreement ──────────────────────────────────────

  it('PUT /api/v1/agreements/:id updates title and body of a draft', async () => {
    const createRes = await createDraft().expect(201);
    const id = createRes.body.id;

    const res = await testApp.agent
      .put(`/api/v1/agreements/${id}`)
      .send({ title: 'Updated Title', body: 'Updated body text.' })
      .expect(200);

    expect(res.body.id).toBe(id);
    expect(res.body.title).toBe('Updated Title');
    expect(res.body.body).toBe('Updated body text.');
    expect(res.body.status).toBe('draft');
  });

  // ─── 5. Open agreement ──────────────────────────────────────────────

  it('POST /api/v1/agreements/:id/open transitions draft to open', async () => {
    const createRes = await createDraft().expect(201);
    const id = createRes.body.id;

    const res = await testApp.agent
      .post(`/api/v1/agreements/${id}/open`)
      .send({})
      .expect(200);

    expect(res.body.id).toBe(id);
    expect(res.body.status).toBe('open');
  });

  // ─── 6. Sign agreement ──────────────────────────────────────────────

  it('POST /api/v1/agreements/:id/sign returns 201 with updated signatureCount', async () => {
    const createRes = await createDraft().expect(201);
    const id = createRes.body.id;

    // Open the agreement first (required before signing)
    await testApp.agent
      .post(`/api/v1/agreements/${id}/open`)
      .send({})
      .expect(200);

    const res = await testApp.agent
      .post(`/api/v1/agreements/${id}/sign`)
      .send({ statement: 'I agree to these terms.' })
      .expect(201);

    expect(res.body.id).toBe(id);
    expect(res.body.signatureCount).toBe(1);
    expect(res.body.mySignature).toBe(true);
  });

  // ─── 7. Retract signature ──────────────────────────────────────────

  it('DELETE /api/v1/agreements/:id/sign retracts signature (204)', async () => {
    const createRes = await createDraft().expect(201);
    const id = createRes.body.id;

    // Open and sign
    await testApp.agent
      .post(`/api/v1/agreements/${id}/open`)
      .send({})
      .expect(200);
    await testApp.agent
      .post(`/api/v1/agreements/${id}/sign`)
      .send({})
      .expect(201);

    // Retract
    await testApp.agent
      .delete(`/api/v1/agreements/${id}/sign`)
      .send({ reason: 'Changed my mind.' })
      .expect(204);

    // Verify signatureCount is back to 0
    const getRes = await testApp.agent
      .get(`/api/v1/agreements/${id}`)
      .expect(200);

    expect(getRes.body.signatureCount).toBe(0);
    expect(getRes.body.mySignature).toBe(false);
  });

  // ─── 8. Re-sign after retraction (partial unique index) ────────────

  it('can re-sign after retraction (partial unique index allows it)', async () => {
    const createRes = await createDraft().expect(201);
    const id = createRes.body.id;

    // Open, sign, retract
    await testApp.agent
      .post(`/api/v1/agreements/${id}/open`)
      .send({})
      .expect(200);
    await testApp.agent
      .post(`/api/v1/agreements/${id}/sign`)
      .send({})
      .expect(201);
    await testApp.agent
      .delete(`/api/v1/agreements/${id}/sign`)
      .send({})
      .expect(204);

    // Re-sign should succeed
    const res = await testApp.agent
      .post(`/api/v1/agreements/${id}/sign`)
      .send({ statement: 'I agree again.' })
      .expect(201);

    expect(res.body.signatureCount).toBe(1);
    expect(res.body.mySignature).toBe(true);
  });

  // ─── 9. Void agreement (admin only) ────────────────────────────────

  it('POST /api/v1/agreements/:id/void voids the agreement (admin)', async () => {
    const createRes = await createDraft().expect(201);
    const id = createRes.body.id;

    // Open the agreement first so it is not just a draft
    await testApp.agent
      .post(`/api/v1/agreements/${id}/open`)
      .send({})
      .expect(200);

    const res = await testApp.agent
      .post(`/api/v1/agreements/${id}/void`)
      .send({})
      .expect(200);

    expect(res.body.id).toBe(id);
    expect(res.body.status).toBe('voided');
  });

  // ─── 10. Create fails without title ────────────────────────────────

  it('POST /api/v1/agreements returns 400 when title is missing', async () => {
    const res = await testApp.agent
      .post('/api/v1/agreements')
      .send({
        body: 'Some body text.',
        agreementType: 'governance',
      })
      .expect(400);

    expect(res.body.error).toBeTruthy();
  });
});
