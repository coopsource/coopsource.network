import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import type { TestApp } from './helpers/test-app.js';

describe('Unified Agreements', () => {
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

  // ─── Helpers ────────────────────────────────────────────────────────

  const sampleAgreement = {
    title: 'Worker Cooperative Agreement',
    purpose: 'Govern the cooperative structure',
    scope: 'All worker-members',
    agreementType: 'worker-cooperative',
  };

  const sampleWithBody = {
    title: 'Code of Conduct',
    body: 'All members shall treat each other with respect.',
    agreementType: 'custom',
  };

  const sampleTerms = {
    stakeholderDid: 'placeholder',
    stakeholderType: 'worker' as const,
    stakeholderClass: 'founding-member',
    contributions: [
      { type: 'labor' as const, description: 'Software development', value: '40hrs/week' },
    ],
    financialTerms: { compensationType: 'salary', profitShare: 10 },
    governanceRights: { votingPower: 1, boardSeat: false },
  };

  function createDraft(overrides: Record<string, unknown> = {}) {
    return testApp.agent
      .post('/api/v1/agreements')
      .send({ ...sampleAgreement, ...overrides });
  }

  function encUri(uri: string): string {
    return encodeURIComponent(uri);
  }

  // ─── CRUD ──────────────────────────────────────────────────────────

  it('creates a draft agreement with structured fields (201)', async () => {
    const res = await createDraft().expect(201);

    expect(res.body.uri).toBeDefined();
    expect(res.body.title).toBe('Worker Cooperative Agreement');
    expect(res.body.purpose).toBe('Govern the cooperative structure');
    expect(res.body.scope).toBe('All worker-members');
    expect(res.body.agreementType).toBe('worker-cooperative');
    expect(res.body.status).toBe('draft');
    expect(res.body.version).toBe(1);
    expect(res.body.authorDid).toBe(adminDid);
    expect(res.body.authorDisplayName).toBe('Test Admin');
    expect(res.body.signatureCount).toBe(0);
    expect(res.body.mySignature).toBe(false);
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.updatedAt).toBeDefined();
  });

  it('creates a draft agreement with body text (201)', async () => {
    const res = await createDraft(sampleWithBody).expect(201);

    expect(res.body.uri).toBeDefined();
    expect(res.body.title).toBe('Code of Conduct');
    expect(res.body.body).toBe('All members shall treat each other with respect.');
    expect(res.body.status).toBe('draft');
  });

  it('lists agreements with pagination', async () => {
    await createDraft({ title: 'Agreement A' }).expect(201);
    testApp.clock.advance(1000);
    await createDraft({ title: 'Agreement B' }).expect(201);

    const res = await testApp.agent.get('/api/v1/agreements').expect(200);

    expect(res.body.agreements).toHaveLength(2);
    expect(res.body.cursor).toBeNull();
    expect(res.body.agreements[0].title).toBe('Agreement B');
    expect(res.body.agreements[1].title).toBe('Agreement A');
  });

  it('lists agreements with status filter', async () => {
    await createDraft({ title: 'Draft One' }).expect(201);
    testApp.clock.advance(1000);

    const created = await createDraft({ title: 'Activated One' }).expect(201);
    await testApp.agent
      .post(`/api/v1/agreements/${encUri(created.body.uri)}/activate`)
      .expect(200);

    const draftRes = await testApp.agent.get('/api/v1/agreements?status=draft').expect(200);
    expect(draftRes.body.agreements).toHaveLength(1);
    expect(draftRes.body.agreements[0].title).toBe('Draft One');

    const activeRes = await testApp.agent.get('/api/v1/agreements?status=active').expect(200);
    expect(activeRes.body.agreements).toHaveLength(1);
    expect(activeRes.body.agreements[0].title).toBe('Activated One');
  });

  it('gets a single agreement by URI', async () => {
    const created = await createDraft().expect(201);

    const res = await testApp.agent
      .get(`/api/v1/agreements/${encUri(created.body.uri)}`)
      .expect(200);

    expect(res.body.title).toBe('Worker Cooperative Agreement');
    expect(res.body.uri).toBe(created.body.uri);
    expect(res.body.signatureCount).toBe(0);
    expect(res.body.mySignature).toBe(false);
  });

  it('updates a draft agreement', async () => {
    const created = await createDraft().expect(201);
    testApp.clock.advance(1000);

    const res = await testApp.agent
      .put(`/api/v1/agreements/${encUri(created.body.uri)}`)
      .send({ title: 'Updated Title', purpose: 'Updated purpose' })
      .expect(200);

    expect(res.body.title).toBe('Updated Title');
    expect(res.body.purpose).toBe('Updated purpose');
    expect(res.body.scope).toBe('All worker-members');
  });

  it('rejects update on non-draft agreement', async () => {
    const created = await createDraft().expect(201);
    const uri = encUri(created.body.uri);

    await testApp.agent.post(`/api/v1/agreements/${uri}/activate`).expect(200);

    await testApp.agent
      .put(`/api/v1/agreements/${uri}`)
      .send({ title: 'Should Fail' })
      .expect(400);
  });

  // ─── Status Transitions ───────────────────────────────────────────

  it('opens a draft agreement (draft→open)', async () => {
    const created = await createDraft().expect(201);

    const res = await testApp.agent
      .post(`/api/v1/agreements/${encUri(created.body.uri)}/open`)
      .send({})
      .expect(200);

    expect(res.body.status).toBe('open');
    expect(res.body.effectiveDate).toBeDefined();
  });

  it('activates a draft agreement (draft→active)', async () => {
    const created = await createDraft().expect(201);

    const res = await testApp.agent
      .post(`/api/v1/agreements/${encUri(created.body.uri)}/activate`)
      .expect(200);

    expect(res.body.status).toBe('active');
    expect(res.body.effectiveDate).toBeDefined();
  });

  it('activates an open agreement (open→active)', async () => {
    const created = await createDraft().expect(201);
    const uri = encUri(created.body.uri);

    await testApp.agent.post(`/api/v1/agreements/${uri}/open`).send({}).expect(200);

    const res = await testApp.agent
      .post(`/api/v1/agreements/${uri}/activate`)
      .expect(200);

    expect(res.body.status).toBe('active');
  });

  it('terminates an active agreement (active→terminated)', async () => {
    const created = await createDraft().expect(201);
    const uri = encUri(created.body.uri);

    await testApp.agent.post(`/api/v1/agreements/${uri}/activate`).expect(200);

    const res = await testApp.agent
      .post(`/api/v1/agreements/${uri}/terminate`)
      .expect(200);

    expect(res.body.status).toBe('terminated');
  });

  it('rejects invalid status transitions', async () => {
    const created = await createDraft().expect(201);
    const uri = encUri(created.body.uri);

    // draft → terminated is not valid
    await testApp.agent
      .post(`/api/v1/agreements/${uri}/terminate`)
      .expect(400);
  });

  it('voids an open agreement', async () => {
    const created = await createDraft().expect(201);
    const uri = encUri(created.body.uri);

    await testApp.agent.post(`/api/v1/agreements/${uri}/open`).send({}).expect(200);

    const res = await testApp.agent
      .post(`/api/v1/agreements/${uri}/void`)
      .send({})
      .expect(200);

    expect(res.body.status).toBe('voided');
  });

  // ─── Signing Workflow ─────────────────────────────────────────────

  it('signs an open agreement (201)', async () => {
    const created = await createDraft(sampleWithBody).expect(201);
    const uri = encUri(created.body.uri);

    await testApp.agent.post(`/api/v1/agreements/${uri}/open`).send({}).expect(200);

    const res = await testApp.agent
      .post(`/api/v1/agreements/${uri}/sign`)
      .send({ statement: 'I agree to these terms.' })
      .expect(201);

    expect(res.body.signatureCount).toBe(1);
    expect(res.body.mySignature).toBe(true);
  });

  it('retracts a signature (204)', async () => {
    const created = await createDraft(sampleWithBody).expect(201);
    const uri = encUri(created.body.uri);

    await testApp.agent.post(`/api/v1/agreements/${uri}/open`).send({}).expect(200);
    await testApp.agent.post(`/api/v1/agreements/${uri}/sign`).send({}).expect(201);

    await testApp.agent
      .delete(`/api/v1/agreements/${uri}/sign`)
      .send({ reason: 'Changed my mind.' })
      .expect(204);

    const getRes = await testApp.agent
      .get(`/api/v1/agreements/${uri}`)
      .expect(200);

    expect(getRes.body.signatureCount).toBe(0);
    expect(getRes.body.mySignature).toBe(false);
  });

  it('can re-sign after retraction', async () => {
    const created = await createDraft(sampleWithBody).expect(201);
    const uri = encUri(created.body.uri);

    await testApp.agent.post(`/api/v1/agreements/${uri}/open`).send({}).expect(200);
    await testApp.agent.post(`/api/v1/agreements/${uri}/sign`).send({}).expect(201);
    await testApp.agent.delete(`/api/v1/agreements/${uri}/sign`).send({}).expect(204);

    const res = await testApp.agent
      .post(`/api/v1/agreements/${uri}/sign`)
      .send({ statement: 'I agree again.' })
      .expect(201);

    expect(res.body.signatureCount).toBe(1);
    expect(res.body.mySignature).toBe(true);
  });

  // ─── Stakeholder Terms ────────────────────────────────────────────

  it('adds stakeholder terms (201)', async () => {
    const created = await createDraft().expect(201);
    const uri = encUri(created.body.uri);

    const res = await testApp.agent
      .post(`/api/v1/agreements/${uri}/terms`)
      .send({ ...sampleTerms, stakeholderDid: adminDid })
      .expect(201);

    expect(res.body.uri).toBeDefined();
    expect(res.body.stakeholderDid).toBe(adminDid);
    expect(res.body.stakeholderType).toBe('worker');
    expect(res.body.stakeholderClass).toBe('founding-member');
    expect(res.body.contributions).toHaveLength(1);
    expect(res.body.financialTerms.profitShare).toBe(10);
    expect(res.body.governanceRights.votingPower).toBe(1);
  });

  it('lists stakeholder terms for an agreement', async () => {
    const created = await createDraft().expect(201);
    const uri = encUri(created.body.uri);

    await testApp.agent
      .post(`/api/v1/agreements/${uri}/terms`)
      .send({ ...sampleTerms, stakeholderDid: adminDid })
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/agreements/${uri}/terms`)
      .expect(200);

    expect(res.body.terms).toHaveLength(1);
    expect(res.body.terms[0].stakeholderType).toBe('worker');
  });

  it('removes stakeholder terms from a draft agreement', async () => {
    const created = await createDraft().expect(201);
    const uri = encUri(created.body.uri);

    const terms = await testApp.agent
      .post(`/api/v1/agreements/${uri}/terms`)
      .send({ ...sampleTerms, stakeholderDid: adminDid })
      .expect(201);

    await testApp.agent
      .delete(`/api/v1/agreements/${uri}/terms/${encodeURIComponent(terms.body.uri)}`)
      .expect(204);

    const list = await testApp.agent
      .get(`/api/v1/agreements/${uri}/terms`)
      .expect(200);

    expect(list.body.terms).toHaveLength(0);
  });

  // ─── Audit Trail ──────────────────────────────────────────────────

  it('tracks revision history', async () => {
    const created = await createDraft().expect(201);
    const uri = encUri(created.body.uri);

    testApp.clock.advance(1000);
    await testApp.agent
      .put(`/api/v1/agreements/${uri}`)
      .send({ title: 'Updated Title' })
      .expect(200);

    testApp.clock.advance(1000);
    await testApp.agent
      .post(`/api/v1/agreements/${uri}/activate`)
      .expect(200);

    const res = await testApp.agent
      .get(`/api/v1/agreements/${uri}/history`)
      .expect(200);

    expect(res.body.revisions).toHaveLength(3);
    expect(res.body.revisions[0].changeType).toBe('created');
    expect(res.body.revisions[1].changeType).toBe('field_update');
    expect(res.body.revisions[2].changeType).toBe('status_change');
  });

  // ─── Validation ───────────────────────────────────────────────────

  it('returns 400 when title is missing', async () => {
    await testApp.agent
      .post('/api/v1/agreements')
      .send({ purpose: 'No title provided' })
      .expect(400);
  });

  // ─── Auth ─────────────────────────────────────────────────────────

  it('requires authentication (401)', async () => {
    const unauthApp = createTestApp();

    await unauthApp.agent.get('/api/v1/agreements').expect(401);
    await unauthApp.agent.post('/api/v1/agreements').expect(401);
  });
});
