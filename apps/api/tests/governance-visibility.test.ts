import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Governance Visibility', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('defaults governance visibility to open', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .get('/api/v1/cooperative')
      .expect(200);

    expect(res.body.governanceVisibility).toBe('open');
  });

  it('updates governance visibility to closed', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'closed' })
      .expect(200);

    expect(res.body.governanceVisibility).toBe('closed');
  });

  it('updates governance visibility to mixed', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'mixed' })
      .expect(200);

    expect(res.body.governanceVisibility).toBe('mixed');
  });

  it('rejects invalid governance visibility values', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'invalid' })
      .expect(400);
  });

  it('returns governance visibility in GET /api/v1/cooperative', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Update to mixed
    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'mixed' })
      .expect(200);

    // Verify it persists
    const res = await testApp.agent
      .get('/api/v1/cooperative')
      .expect(200);

    expect(res.body.governanceVisibility).toBe('mixed');
  });

  it('VisibilityRouter returns correct tier for each mode', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);

    // Default is 'open' → Tier 1
    const openResult = await testApp.container.visibilityRouter.routeWrite({
      cooperativeDid: coopDid,
      collection: 'test.collection',
      record: { data: 'test' },
      createdBy: 'did:web:test',
    });
    expect(openResult.tier).toBe(1);

    // Set to 'closed' → Tier 2
    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'closed' })
      .expect(200);

    const closedResult = await testApp.container.visibilityRouter.routeWrite({
      cooperativeDid: coopDid,
      collection: 'test.collection',
      record: { data: 'private' },
      createdBy: 'did:web:test',
    });
    expect(closedResult.tier).toBe(2);
    expect(closedResult.rkey).toBeDefined();

    // Set to 'mixed' without override → Tier 1 (default)
    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'mixed' })
      .expect(200);

    const mixedResult = await testApp.container.visibilityRouter.routeWrite({
      cooperativeDid: coopDid,
      collection: 'test.collection',
      record: { data: 'mixed' },
      createdBy: 'did:web:test',
    });
    expect(mixedResult.tier).toBe(1);

    // Mixed with private override → Tier 2
    const mixedPrivateResult = await testApp.container.visibilityRouter.routeWrite({
      cooperativeDid: coopDid,
      collection: 'test.collection',
      record: { data: 'forced-private' },
      createdBy: 'did:web:test',
      visibilityOverride: 'private',
    });
    expect(mixedPrivateResult.tier).toBe(2);
    expect(mixedPrivateResult.rkey).toBeDefined();

    // Open with public override → Tier 1
    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'closed' })
      .expect(200);

    const publicOverrideResult = await testApp.container.visibilityRouter.routeWrite({
      cooperativeDid: coopDid,
      collection: 'test.collection',
      record: { data: 'forced-public' },
      createdBy: 'did:web:test',
      visibilityOverride: 'public',
    });
    expect(publicOverrideResult.tier).toBe(1);
  });
});
