import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Funding Campaigns', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  async function createDraftCampaign(
    agent: import('supertest').Agent,
    overrides: Record<string, unknown> = {},
  ) {
    const body = {
      beneficiaryUri: 'self',
      title: 'Fund Our Project',
      description: 'Help us build something great.',
      tier: 'cooperative',
      campaignType: 'donation',
      goalAmount: 100000, // $1,000 in cents
      goalCurrency: 'USD',
      fundingModel: 'all_or_nothing',
      ...overrides,
    };
    const res = await agent.post('/api/v1/campaigns').send(body).expect(201);
    return res.body;
  }

  // ─── Create ──────────────────────────────────────────────────────────

  it('creates a draft campaign (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const campaign = await createDraftCampaign(testApp.agent);

    expect(campaign.uri).toBeDefined();
    expect(campaign.title).toBe('Fund Our Project');
    expect(campaign.description).toBe('Help us build something great.');
    expect(campaign.status).toBe('draft');
    expect(campaign.tier).toBe('cooperative');
    expect(campaign.campaignType).toBe('donation');
    expect(campaign.goalAmount).toBe(100000);
    expect(campaign.goalCurrency).toBe('USD');
    expect(campaign.amountRaised).toBe(0);
    expect(campaign.backerCount).toBe(0);
    expect(campaign.fundingModel).toBe('all_or_nothing');
    expect(campaign.createdAt).toBeDefined();
  });

  // ─── List ────────────────────────────────────────────────────────────

  it('lists campaigns with pagination', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await createDraftCampaign(testApp.agent, { title: 'Campaign A' });
    testApp.clock.advance(1000);
    await createDraftCampaign(testApp.agent, { title: 'Campaign B' });

    const res = await testApp.agent.get('/api/v1/campaigns').expect(200);

    expect(res.body.campaigns).toHaveLength(2);
    expect(res.body.campaigns[0].title).toBe('Campaign B'); // most recent first
    expect(res.body.campaigns[1].title).toBe('Campaign A');
  });

  it('filters campaigns by status', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await createDraftCampaign(testApp.agent, { title: 'Draft One' });

    const res = await testApp.agent
      .get('/api/v1/campaigns?status=active')
      .expect(200);

    expect(res.body.campaigns).toHaveLength(0);
  });

  // ─── Get ─────────────────────────────────────────────────────────────

  it('gets a campaign by URI', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const campaign = await createDraftCampaign(testApp.agent);

    const res = await testApp.agent
      .get(`/api/v1/campaigns/${encodeURIComponent(campaign.uri)}`)
      .expect(200);

    expect(res.body.title).toBe('Fund Our Project');
    expect(res.body.uri).toBe(campaign.uri);
  });

  it('returns 404 for nonexistent campaign', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .get(`/api/v1/campaigns/${encodeURIComponent('at://did:plc:fake/network.coopsource.funding.campaign/fake')}`)
      .expect(404);
  });

  // ─── Update ──────────────────────────────────────────────────────────

  it('updates a draft campaign', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const campaign = await createDraftCampaign(testApp.agent);

    const res = await testApp.agent
      .put(`/api/v1/campaigns/${encodeURIComponent(campaign.uri)}`)
      .send({ title: 'Updated Title', goalAmount: 200000 })
      .expect(200);

    expect(res.body.title).toBe('Updated Title');
    expect(res.body.goalAmount).toBe(200000);
  });

  it('allows title/description update on active campaign', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const campaign = await createDraftCampaign(testApp.agent);

    // Activate first
    await testApp.agent
      .post(`/api/v1/campaigns/${encodeURIComponent(campaign.uri)}/status`)
      .send({ status: 'active' })
      .expect(200);

    // Update title and description — should succeed
    const res = await testApp.agent
      .put(`/api/v1/campaigns/${encodeURIComponent(campaign.uri)}`)
      .send({ title: 'Updated Active Title', description: 'New description' })
      .expect(200);

    expect(res.body.title).toBe('Updated Active Title');
    expect(res.body.description).toBe('New description');
  });

  it('rejects fundingModel change on active campaign', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const campaign = await createDraftCampaign(testApp.agent);

    // Activate first
    await testApp.agent
      .post(`/api/v1/campaigns/${encodeURIComponent(campaign.uri)}/status`)
      .send({ status: 'active' })
      .expect(200);

    // Try to change fundingModel on active campaign — should fail (business logic guard)
    await testApp.agent
      .put(`/api/v1/campaigns/${encodeURIComponent(campaign.uri)}`)
      .send({ fundingModel: 'keep_it_all' })
      .expect(400);
  });

  it('allows fundingModel change on draft campaign', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const campaign = await createDraftCampaign(testApp.agent);

    // Update fundingModel while still in draft — should succeed
    const res = await testApp.agent
      .put(`/api/v1/campaigns/${encodeURIComponent(campaign.uri)}`)
      .send({ fundingModel: 'keep_it_all' })
      .expect(200);

    expect(res.body.fundingModel).toBe('keep_it_all');
  });

  it('rejects update on cancelled campaign', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const campaign = await createDraftCampaign(testApp.agent);

    // Cancel the campaign
    await testApp.agent
      .post(`/api/v1/campaigns/${encodeURIComponent(campaign.uri)}/status`)
      .send({ status: 'cancelled' })
      .expect(200);

    // Try to update — should fail
    await testApp.agent
      .put(`/api/v1/campaigns/${encodeURIComponent(campaign.uri)}`)
      .send({ title: 'Should Fail' })
      .expect(400);
  });

  // ─── Status Transitions ──────────────────────────────────────────────

  it('activates a draft campaign', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const campaign = await createDraftCampaign(testApp.agent);

    const res = await testApp.agent
      .post(`/api/v1/campaigns/${encodeURIComponent(campaign.uri)}/status`)
      .send({ status: 'active' })
      .expect(200);

    expect(res.body.status).toBe('active');
  });

  it('cancels a draft campaign', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const campaign = await createDraftCampaign(testApp.agent);

    const res = await testApp.agent
      .post(`/api/v1/campaigns/${encodeURIComponent(campaign.uri)}/status`)
      .send({ status: 'cancelled' })
      .expect(200);

    expect(res.body.status).toBe('cancelled');
  });

  it('rejects invalid status transitions', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const campaign = await createDraftCampaign(testApp.agent);

    // Cannot go from draft to completed
    await testApp.agent
      .post(`/api/v1/campaigns/${encodeURIComponent(campaign.uri)}/status`)
      .send({ status: 'completed' })
      .expect(400);
  });

  // ─── Pledges ─────────────────────────────────────────────────────────

  /**
   * Pledges are member-class Tier 2 — a pledge names a backer and an amount.
   * They were published to public repos; the write boundary now refuses that
   * (audit C-03). Rewrite this to assert member-class placement once the
   * collection has a real permissioned destination.
   */
  it('refuses to create a pledge while pledges have no Tier 2 write path', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const campaign = await createDraftCampaign(testApp.agent);

    await testApp.agent
      .post(`/api/v1/campaigns/${encodeURIComponent(campaign.uri)}/status`)
      .send({ status: 'active' })
      .expect(200);

    const res = await testApp.agent
      .post(`/api/v1/campaigns/${encodeURIComponent(campaign.uri)}/pledge`)
      .send({ amount: 5000, currency: 'USD' });

    expect(res.status).toBe(501);
    expect(res.body.error).toBe('Tier2WriteUnavailable');
  });

  it('rejects pledge on draft campaign', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const campaign = await createDraftCampaign(testApp.agent);

    await testApp.agent
      .post(`/api/v1/campaigns/${encodeURIComponent(campaign.uri)}/pledge`)
      .send({ amount: 5000, currency: 'USD' })
      .expect(400);
  });

  it('lists no pledges, because none can be created', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const campaign = await createDraftCampaign(testApp.agent);
    await testApp.agent
      .post(`/api/v1/campaigns/${encodeURIComponent(campaign.uri)}/status`)
      .send({ status: 'active' })
      .expect(200);

    const res = await testApp.agent
      .get(`/api/v1/campaigns/${encodeURIComponent(campaign.uri)}/pledges`)
      .expect(200);

    expect(res.body.pledges).toHaveLength(0);
  });

  // ─── Validation ──────────────────────────────────────────────────────

  it('rejects campaign with missing required fields', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/campaigns')
      .send({ title: 'Missing fields' })
      .expect(400);
  });

  it('requires authentication', async () => {
    const testApp = createTestApp();

    await testApp.agent
      .get('/api/v1/campaigns')
      .expect(401);
  });
});
