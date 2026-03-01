import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Payment Provider Config API', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  // ─── Supported Providers ──────────────────────────────────────────────

  it('lists supported provider types (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .get('/api/v1/payment-providers/supported')
      .expect(200);

    expect(res.body.providers).toEqual([
      { id: 'stripe', displayName: 'Stripe' },
    ]);
  });

  // ─── CRUD ─────────────────────────────────────────────────────────────

  it('adds a payment provider config (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/payment-providers')
      .send({
        providerId: 'stripe',
        displayName: 'Stripe',
        credentials: { secretKey: 'sk_test_123' },
        webhookSecret: 'whsec_test_456',
      })
      .expect(201);

    expect(res.body.providerId).toBe('stripe');
    expect(res.body.displayName).toBe('Stripe');
    expect(res.body.enabled).toBe(true);
    expect(res.body.id).toBeDefined();
    // Should NOT return credentials
    expect(res.body.credentials).toBeUndefined();
    expect(res.body.credentialsEnc).toBeUndefined();
  });

  it('lists configured providers (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/payment-providers')
      .send({
        providerId: 'stripe',
        displayName: 'Stripe',
        credentials: { secretKey: 'sk_test_123' },
      })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/payment-providers')
      .expect(200);

    expect(res.body.providers).toHaveLength(1);
    expect(res.body.providers[0].providerId).toBe('stripe');
  });

  it('updates a provider config (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/payment-providers')
      .send({
        providerId: 'stripe',
        displayName: 'Stripe',
        credentials: { secretKey: 'sk_test_123' },
      })
      .expect(201);

    const res = await testApp.agent
      .put('/api/v1/payment-providers/stripe')
      .send({ displayName: 'Stripe (Live)', enabled: false })
      .expect(200);

    expect(res.body.displayName).toBe('Stripe (Live)');
    expect(res.body.enabled).toBe(false);
  });

  it('removes a provider config (204)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/payment-providers')
      .send({
        providerId: 'stripe',
        displayName: 'Stripe',
        credentials: { secretKey: 'sk_test_123' },
      })
      .expect(201);

    await testApp.agent
      .delete('/api/v1/payment-providers/stripe')
      .expect(204);

    // Should be gone
    const res = await testApp.agent
      .get('/api/v1/payment-providers')
      .expect(200);

    expect(res.body.providers).toHaveLength(0);
  });

  // ─── Validation ───────────────────────────────────────────────────────

  it('rejects unsupported provider type (404)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/payment-providers')
      .send({
        providerId: 'unsupported',
        displayName: 'Unknown',
        credentials: { secretKey: 'sk_test' },
      })
      .expect(404);
  });

  it('rejects duplicate provider config (500)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/payment-providers')
      .send({
        providerId: 'stripe',
        displayName: 'Stripe',
        credentials: { secretKey: 'sk_test_123' },
      })
      .expect(201);

    // Duplicate
    await testApp.agent
      .post('/api/v1/payment-providers')
      .send({
        providerId: 'stripe',
        displayName: 'Stripe Again',
        credentials: { secretKey: 'sk_test_456' },
      })
      .expect(500); // unique constraint violation
  });

  // ─── Auth ─────────────────────────────────────────────────────────────

  it('requires authentication', async () => {
    const testApp = createTestApp();

    await testApp.agent
      .get('/api/v1/payment-providers')
      .expect(401);
  });

  // ─── Campaign Providers Endpoint ──────────────────────────────────────

  it('lists empty providers for campaign with no config', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Create a campaign first
    const campaignRes = await testApp.agent
      .post('/api/v1/campaigns')
      .send({
        beneficiaryUri: 'self',
        title: 'Test Campaign',
        tier: 'cooperative',
        campaignType: 'donation',
        goalAmount: 10000,
        fundingModel: 'all_or_nothing',
      })
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/campaigns/${encodeURIComponent(campaignRes.body.uri)}/providers`)
      .expect(200);

    expect(res.body.providers).toEqual([]);
  });

  it('lists configured providers for campaign', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Configure stripe
    await testApp.agent
      .post('/api/v1/payment-providers')
      .send({
        providerId: 'stripe',
        displayName: 'Stripe',
        credentials: { secretKey: 'sk_test_123' },
      })
      .expect(201);

    // Create a campaign
    const campaignRes = await testApp.agent
      .post('/api/v1/campaigns')
      .send({
        beneficiaryUri: 'self',
        title: 'Test Campaign',
        tier: 'cooperative',
        campaignType: 'donation',
        goalAmount: 10000,
        fundingModel: 'all_or_nothing',
      })
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/campaigns/${encodeURIComponent(campaignRes.body.uri)}/providers`)
      .expect(200);

    expect(res.body.providers).toHaveLength(1);
    expect(res.body.providers[0]).toEqual({ id: 'stripe', displayName: 'Stripe' });
  });
});
