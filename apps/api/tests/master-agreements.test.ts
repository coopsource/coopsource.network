import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Master Agreements', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  const sampleAgreement = {
    title: 'Worker Cooperative Agreement',
    purpose: 'Govern the cooperative structure',
    scope: 'All worker-members',
    agreementType: 'worker-cooperative' as const,
  };

  const sampleTerms = {
    stakeholderDid: 'did:plc:placeholder',
    stakeholderType: 'worker' as const,
    stakeholderClass: 'founding-member',
    contributions: [
      { type: 'labor' as const, description: 'Software development', value: '40hrs/week' },
    ],
    financialTerms: { compensationType: 'salary', profitShare: 10 },
    governanceRights: { votingPower: 1, boardSeat: false },
  };

  // ─── CRUD ──────────────────────────────────────────────────────────

  it('creates a draft master agreement (201)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/master-agreements')
      .send(sampleAgreement)
      .expect(201);

    expect(res.body.uri).toBeDefined();
    expect(res.body.did).toBe(adminDid);
    expect(res.body.title).toBe('Worker Cooperative Agreement');
    expect(res.body.purpose).toBe('Govern the cooperative structure');
    expect(res.body.agreementType).toBe('worker-cooperative');
    expect(res.body.status).toBe('draft');
    expect(res.body.version).toBe(1);
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.updatedAt).toBeDefined();
  });

  it('lists master agreements with pagination', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/master-agreements')
      .send(sampleAgreement)
      .expect(201);

    testApp.clock.advance(1000);

    await testApp.agent
      .post('/api/v1/master-agreements')
      .send({ ...sampleAgreement, title: 'Second Agreement' })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/master-agreements')
      .expect(200);

    expect(res.body.masterAgreements).toHaveLength(2);
    expect(res.body.masterAgreements[0].title).toBe('Second Agreement');
  });

  it('gets a single master agreement by URI', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/master-agreements')
      .send(sampleAgreement)
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/master-agreements/${encodeURIComponent(created.body.uri)}`)
      .expect(200);

    expect(res.body.title).toBe('Worker Cooperative Agreement');
    expect(res.body.uri).toBe(created.body.uri);
  });

  it('updates a draft master agreement', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/master-agreements')
      .send(sampleAgreement)
      .expect(201);

    testApp.clock.advance(1000);

    const res = await testApp.agent
      .put(`/api/v1/master-agreements/${encodeURIComponent(created.body.uri)}`)
      .send({ title: 'Updated Title', purpose: 'Updated purpose' })
      .expect(200);

    expect(res.body.title).toBe('Updated Title');
    expect(res.body.purpose).toBe('Updated purpose');
    expect(res.body.scope).toBe('All worker-members');
  });

  it('rejects update on non-draft agreement', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/master-agreements')
      .send(sampleAgreement)
      .expect(201);

    const uri = encodeURIComponent(created.body.uri);

    // Activate it
    await testApp.agent
      .post(`/api/v1/master-agreements/${uri}/activate`)
      .expect(200);

    // Try to update — should fail
    await testApp.agent
      .put(`/api/v1/master-agreements/${uri}`)
      .send({ title: 'Should Fail' })
      .expect(400);
  });

  // ─── Status Transitions ───────────────────────────────────────────

  it('activates a draft agreement (draft→active)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/master-agreements')
      .send(sampleAgreement)
      .expect(201);

    const res = await testApp.agent
      .post(`/api/v1/master-agreements/${encodeURIComponent(created.body.uri)}/activate`)
      .expect(200);

    expect(res.body.status).toBe('active');
    expect(res.body.effectiveDate).toBeDefined();
  });

  it('terminates an active agreement (active→terminated)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/master-agreements')
      .send(sampleAgreement)
      .expect(201);

    const uri = encodeURIComponent(created.body.uri);

    await testApp.agent
      .post(`/api/v1/master-agreements/${uri}/activate`)
      .expect(200);

    const res = await testApp.agent
      .post(`/api/v1/master-agreements/${uri}/terminate`)
      .expect(200);

    expect(res.body.status).toBe('terminated');
  });

  it('rejects invalid status transitions', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/master-agreements')
      .send(sampleAgreement)
      .expect(201);

    const uri = encodeURIComponent(created.body.uri);

    // draft → terminated is not valid (must activate first)
    await testApp.agent
      .post(`/api/v1/master-agreements/${uri}/terminate`)
      .expect(400);
  });

  // ─── Stakeholder Terms ────────────────────────────────────────────

  it('adds stakeholder terms (201)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/master-agreements')
      .send(sampleAgreement)
      .expect(201);

    const res = await testApp.agent
      .post(`/api/v1/master-agreements/${encodeURIComponent(created.body.uri)}/terms`)
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
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/master-agreements')
      .send(sampleAgreement)
      .expect(201);

    const agreementUri = encodeURIComponent(created.body.uri);

    await testApp.agent
      .post(`/api/v1/master-agreements/${agreementUri}/terms`)
      .send({ ...sampleTerms, stakeholderDid: adminDid })
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/master-agreements/${agreementUri}/terms`)
      .expect(200);

    expect(res.body.terms).toHaveLength(1);
    expect(res.body.terms[0].stakeholderType).toBe('worker');
  });

  it('removes stakeholder terms from a draft agreement', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/master-agreements')
      .send(sampleAgreement)
      .expect(201);

    const agreementUri = encodeURIComponent(created.body.uri);

    const terms = await testApp.agent
      .post(`/api/v1/master-agreements/${agreementUri}/terms`)
      .send({ ...sampleTerms, stakeholderDid: adminDid })
      .expect(201);

    await testApp.agent
      .delete(`/api/v1/master-agreements/${agreementUri}/terms/${encodeURIComponent(terms.body.uri)}`)
      .expect(204);

    const list = await testApp.agent
      .get(`/api/v1/master-agreements/${agreementUri}/terms`)
      .expect(200);

    expect(list.body.terms).toHaveLength(0);
  });

  // ─── Validation ───────────────────────────────────────────────────

  it('returns 400 when title is missing', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/master-agreements')
      .send({ purpose: 'No title provided' })
      .expect(400);
  });

  // ─── Auth ─────────────────────────────────────────────────────────

  it('requires authentication (401)', async () => {
    const testApp = createTestApp();

    await testApp.agent.get('/api/v1/master-agreements').expect(401);
    await testApp.agent.post('/api/v1/master-agreements').expect(401);
  });
});
