import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Alignment Discovery', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  const sampleInterests = {
    interests: [
      { category: 'sustainability', description: 'Reduce carbon footprint', priority: 5, scope: 'long-term' },
      { category: 'revenue', description: 'Grow revenue 20% YoY', priority: 4 },
    ],
    contributions: [
      { type: 'skill', description: 'Software development', capacity: '20 hrs/week' },
    ],
    constraints: [
      { description: 'Limited budget for Q1', hardConstraint: true },
    ],
    redLines: [
      { description: 'No fossil fuel partnerships', reason: 'Environmental policy' },
    ],
    preferences: {
      decisionMaking: 'Consensus',
      communication: 'Async-first',
      pace: 'Steady iteration',
    },
  };

  // ─── Interests ──────────────────────────────────────────────────────

  it('submits interests (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/alignment/interests')
      .send(sampleInterests)
      .expect(201);

    expect(res.body.uri).toBeDefined();
    expect(res.body.interests).toHaveLength(2);
    expect(res.body.interests[0].category).toBe('sustainability');
    expect(res.body.contributions).toHaveLength(1);
    expect(res.body.constraints).toHaveLength(1);
    expect(res.body.redLines).toHaveLength(1);
    expect(res.body.preferences.decisionMaking).toBe('Consensus');
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.updatedAt).toBeDefined();
  });

  it('rejects duplicate interest submission', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/alignment/interests')
      .send(sampleInterests)
      .expect(201);

    await testApp.agent
      .post('/api/v1/alignment/interests')
      .send(sampleInterests)
      .expect(400);
  });

  it('lists all stakeholder interests', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/alignment/interests')
      .send(sampleInterests)
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/alignment/interests')
      .expect(200);

    expect(res.body.interests).toHaveLength(1);
    expect(res.body.interests[0].interests).toHaveLength(2);
  });

  it('gets my interests', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/alignment/interests')
      .send(sampleInterests)
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/alignment/interests/me')
      .expect(200);

    expect(res.body.interests).toHaveLength(2);
    expect(res.body.preferences.communication).toBe('Async-first');
  });

  it('returns null when no interests submitted', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .get('/api/v1/alignment/interests/me')
      .expect(200);

    expect(res.body).toBeNull();
  });

  it('updates interests', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/alignment/interests')
      .send(sampleInterests)
      .expect(201);

    testApp.clock.advance(1000);

    const res = await testApp.agent
      .put('/api/v1/alignment/interests')
      .send({
        interests: [
          { category: 'innovation', description: 'Pioneer new approaches', priority: 5 },
        ],
      })
      .expect(200);

    expect(res.body.interests).toHaveLength(1);
    expect(res.body.interests[0].category).toBe('innovation');
    // Contributions should remain from original submission
    expect(res.body.contributions).toHaveLength(1);
  });

  it('rejects update when no interests exist', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .put('/api/v1/alignment/interests')
      .send({
        interests: [
          { category: 'test', description: 'Test', priority: 1 },
        ],
      })
      .expect(404);
  });

  // ─── Outcomes ───────────────────────────────────────────────────────

  it('creates a desired outcome (201)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/alignment/outcomes')
      .send({
        title: 'Carbon Neutral by 2030',
        description: 'Achieve net-zero carbon emissions.',
        category: 'environmental',
        successCriteria: [
          { metric: 'Carbon emissions', target: 'Net zero', timeline: '2030' },
        ],
      })
      .expect(201);

    expect(res.body.uri).toBeDefined();
    expect(res.body.did).toBe(adminDid);
    expect(res.body.title).toBe('Carbon Neutral by 2030');
    expect(res.body.category).toBe('environmental');
    expect(res.body.status).toBe('proposed');
    expect(res.body.successCriteria).toHaveLength(1);
    expect(res.body.stakeholderSupport).toHaveLength(0);
  });

  it('lists outcomes with pagination', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/alignment/outcomes')
      .send({ title: 'Outcome A', category: 'financial' })
      .expect(201);

    testApp.clock.advance(1000);

    await testApp.agent
      .post('/api/v1/alignment/outcomes')
      .send({ title: 'Outcome B', category: 'social' })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/alignment/outcomes')
      .expect(200);

    expect(res.body.outcomes).toHaveLength(2);
    expect(res.body.outcomes[0].title).toBe('Outcome B'); // most recent first
  });

  it('filters outcomes by status', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/alignment/outcomes')
      .send({ title: 'Proposed Outcome', category: 'other' })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/alignment/outcomes?status=endorsed')
      .expect(200);

    expect(res.body.outcomes).toHaveLength(0);
  });

  it('gets a single outcome by URI', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/alignment/outcomes')
      .send({ title: 'My Outcome', category: 'governance' })
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/alignment/outcomes/${encodeURIComponent(created.body.uri)}`)
      .expect(200);

    expect(res.body.title).toBe('My Outcome');
  });

  it('returns 404 for nonexistent outcome', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .get(`/api/v1/alignment/outcomes/${encodeURIComponent('at://did:plc:fake/network.coopsource.alignment.outcome/fake')}`)
      .expect(404);
  });

  it('adds stakeholder support to an outcome', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/alignment/outcomes')
      .send({ title: 'Support Test', category: 'social' })
      .expect(201);

    const res = await testApp.agent
      .post(`/api/v1/alignment/outcomes/${encodeURIComponent(created.body.uri)}/support`)
      .send({ level: 'strong', conditions: 'If budget allows' })
      .expect(200);

    expect(res.body.stakeholderSupport).toHaveLength(1);
    expect(res.body.stakeholderSupport[0].supportLevel).toBe('strong');
    expect(res.body.stakeholderSupport[0].conditions).toBe('If budget allows');
  });

  it('replaces existing support from same stakeholder', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/alignment/outcomes')
      .send({ title: 'Replace Test', category: 'other' })
      .expect(201);

    const uri = encodeURIComponent(created.body.uri);

    await testApp.agent
      .post(`/api/v1/alignment/outcomes/${uri}/support`)
      .send({ level: 'moderate' })
      .expect(200);

    const res = await testApp.agent
      .post(`/api/v1/alignment/outcomes/${uri}/support`)
      .send({ level: 'strong' })
      .expect(200);

    // Should still be 1 entry, not 2
    expect(res.body.stakeholderSupport).toHaveLength(1);
    expect(res.body.stakeholderSupport[0].supportLevel).toBe('strong');
  });

  // ─── Interest Map ───────────────────────────────────────────────────

  it('generates an interest map', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Submit interests first
    await testApp.agent
      .post('/api/v1/alignment/interests')
      .send(sampleInterests)
      .expect(201);

    testApp.clock.advance(1000);

    const res = await testApp.agent
      .post('/api/v1/alignment/map/generate')
      .expect(201);

    expect(res.body.uri).toBeDefined();
    expect(res.body.alignmentZones).toBeDefined();
    expect(res.body.conflictZones).toBeDefined();
    expect(res.body.aiAnalysis).toBeNull();
    expect(res.body.createdAt).toBeDefined();
  });

  it('gets the current interest map', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // No map yet
    const empty = await testApp.agent
      .get('/api/v1/alignment/map')
      .expect(200);

    expect(empty.body).toBeNull();

    // Submit interests and generate map
    await testApp.agent
      .post('/api/v1/alignment/interests')
      .send(sampleInterests)
      .expect(201);

    testApp.clock.advance(1000);

    await testApp.agent
      .post('/api/v1/alignment/map/generate')
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/alignment/map')
      .expect(200);

    expect(res.body.uri).toBeDefined();
    expect(res.body.projectUri).toBeDefined();
  });

  // ─── Auth ───────────────────────────────────────────────────────────

  it('requires authentication for interests', async () => {
    const testApp = createTestApp();

    await testApp.agent.get('/api/v1/alignment/interests').expect(401);
    await testApp.agent.post('/api/v1/alignment/interests').expect(401);
    await testApp.agent.put('/api/v1/alignment/interests').expect(401);
    await testApp.agent.get('/api/v1/alignment/interests/me').expect(401);
  });

  it('requires authentication for outcomes', async () => {
    const testApp = createTestApp();

    await testApp.agent.get('/api/v1/alignment/outcomes').expect(401);
    await testApp.agent.post('/api/v1/alignment/outcomes').expect(401);
  });

  it('requires authentication for map', async () => {
    const testApp = createTestApp();

    await testApp.agent.get('/api/v1/alignment/map').expect(401);
    await testApp.agent.post('/api/v1/alignment/map/generate').expect(401);
  });

  // ─── Validation ─────────────────────────────────────────────────────

  it('rejects interests with no interests array', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/alignment/interests')
      .send({ contributions: [] })
      .expect(400);
  });

  it('rejects outcome with missing title', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/alignment/outcomes')
      .send({ category: 'financial' })
      .expect(400);
  });

  it('rejects invalid support level', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/alignment/outcomes')
      .send({ title: 'Validation Test', category: 'other' })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/alignment/outcomes/${encodeURIComponent(created.body.uri)}/support`)
      .send({ level: 'invalid_level' })
      .expect(400);
  });

  // ─── Status Lifecycle ─────────────────────────────────────────────

  it('transitions outcome from proposed → endorsed', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/alignment/outcomes')
      .send({ title: 'Status Test', category: 'governance' })
      .expect(201);

    const uri = encodeURIComponent(created.body.uri);

    const res = await testApp.agent
      .post(`/api/v1/alignment/outcomes/${uri}/status`)
      .send({ status: 'endorsed' })
      .expect(200);

    expect(res.body.status).toBe('endorsed');
  });

  it('transitions outcome through full lifecycle', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/alignment/outcomes')
      .send({ title: 'Full Lifecycle', category: 'financial' })
      .expect(201);

    const uri = encodeURIComponent(created.body.uri);

    // proposed → endorsed
    await testApp.agent
      .post(`/api/v1/alignment/outcomes/${uri}/status`)
      .send({ status: 'endorsed' })
      .expect(200);

    // endorsed → active
    await testApp.agent
      .post(`/api/v1/alignment/outcomes/${uri}/status`)
      .send({ status: 'active' })
      .expect(200);

    // active → achieved
    const res = await testApp.agent
      .post(`/api/v1/alignment/outcomes/${uri}/status`)
      .send({ status: 'achieved' })
      .expect(200);

    expect(res.body.status).toBe('achieved');
  });

  it('rejects invalid status transition', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/alignment/outcomes')
      .send({ title: 'Invalid Transition', category: 'social' })
      .expect(201);

    const uri = encodeURIComponent(created.body.uri);

    // proposed → active is not valid (must go through endorsed first)
    await testApp.agent
      .post(`/api/v1/alignment/outcomes/${uri}/status`)
      .send({ status: 'active' })
      .expect(400);
  });

  it('allows abandoning from any active status', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/alignment/outcomes')
      .send({ title: 'Abandon Test', category: 'other' })
      .expect(201);

    const uri = encodeURIComponent(created.body.uri);

    // proposed → abandoned
    const res = await testApp.agent
      .post(`/api/v1/alignment/outcomes/${uri}/status`)
      .send({ status: 'abandoned' })
      .expect(200);

    expect(res.body.status).toBe('abandoned');
  });

  it('rejects transition from terminal status', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await testApp.agent
      .post('/api/v1/alignment/outcomes')
      .send({ title: 'Terminal Test', category: 'other' })
      .expect(201);

    const uri = encodeURIComponent(created.body.uri);

    // Move to abandoned (terminal)
    await testApp.agent
      .post(`/api/v1/alignment/outcomes/${uri}/status`)
      .send({ status: 'abandoned' })
      .expect(200);

    // Cannot transition from abandoned
    await testApp.agent
      .post(`/api/v1/alignment/outcomes/${uri}/status`)
      .send({ status: 'proposed' })
      .expect(400);
  });
});
