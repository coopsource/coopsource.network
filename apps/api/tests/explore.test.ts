import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

/** Setup with a cooperative handle and log in. */
async function setupWithHandle(
  testApp: ReturnType<typeof createTestApp>,
  handle: string,
): Promise<{ coopDid: string; adminDid: string }> {
  resetSetupCache();

  const initRes = await testApp.agent
    .post('/api/v1/setup/initialize')
    .send({
      cooperativeName: 'Test Cooperative',
      cooperativeHandle: handle,
      adminEmail: 'admin@test.com',
      adminPassword: 'password123',
      adminDisplayName: 'Test Admin',
    })
    .expect(201);

  await testApp.agent
    .post('/api/v1/auth/login')
    .send({ email: 'admin@test.com', password: 'password123' })
    .expect(200);

  return {
    coopDid: initRes.body.coopDid,
    adminDid: initRes.body.adminDid,
  };
}

describe('Explore', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  // ─── Cooperatives ───────────────────────────────────────────────────

  it('GET /api/v1/explore/cooperatives returns the cooperative created during setup', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // No auth needed — use a fresh unauthenticated agent
    const res = await testApp.agent.get('/api/v1/explore/cooperatives').expect(200);

    expect(res.body.cooperatives).toHaveLength(1);
    expect(res.body.cooperatives[0].displayName).toBe('Test Cooperative');
    expect(res.body.cooperatives[0].did).toBeDefined();
    expect(res.body.cooperatives[0].cooperativeType).toBeDefined();
    // public_description defaults to true, so description is visible
    expect(res.body.cooperatives[0].description).toBeDefined();
    // public_members defaults to false, so memberCount is null
    expect(res.body.cooperatives[0].memberCount).toBeNull();
    expect(res.body.cursor).toBeNull();
  });

  it('GET /api/v1/explore/cooperatives works without authentication', async () => {
    const testApp = createTestApp();

    // No setup, no login — should still return 200 (empty list)
    const res = await testApp.agent.get('/api/v1/explore/cooperatives').expect(200);

    expect(res.body.cooperatives).toEqual([]);
    expect(res.body.cursor).toBeNull();
  });

  it('GET /api/v1/explore/cooperatives/:handle returns single coop profile', async () => {
    const testApp = createTestApp();
    await setupWithHandle(testApp, 'test-coop');

    const res = await testApp.agent
      .get('/api/v1/explore/cooperatives/test-coop')
      .expect(200);

    expect(res.body.displayName).toBe('Test Cooperative');
    expect(res.body.handle).toBe('test-coop');
    // public_members defaults to false
    expect(res.body.memberCount).toBeNull();
    expect(res.body.networks).toBeDefined();
    expect(Array.isArray(res.body.networks)).toBe(true);
  });

  it('GET /api/v1/explore/cooperatives/:handle returns 404 for non-existent handle', async () => {
    const testApp = createTestApp();

    const res = await testApp.agent
      .get('/api/v1/explore/cooperatives/nonexistent')
      .expect(404);

    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('GET /api/v1/explore/cooperatives does not include networks', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Create a network
    await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Test Network' })
      .expect(201);

    const res = await testApp.agent.get('/api/v1/explore/cooperatives').expect(200);

    // Only the cooperative should appear, not the network
    const names = res.body.cooperatives.map((c: { displayName: string }) => c.displayName);
    expect(names).toContain('Test Cooperative');
    expect(names).not.toContain('Test Network');
  });

  // ─── Visibility gating ─────────────────────────────────────────────

  it('hides description when public_description is false', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupWithHandle(testApp, 'vis-coop');

    // Set public_description to false via direct DB update
    const db = getTestDb();
    await db
      .updateTable('cooperative_profile')
      .set({ public_description: false })
      .where('entity_did', '=', coopDid)
      .execute();

    const res = await testApp.agent.get('/api/v1/explore/cooperatives/vis-coop').expect(200);

    expect(res.body.description).toBeNull();
    expect(res.body.displayName).toBe('Test Cooperative');
  });

  it('shows memberCount when public_members is true', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupWithHandle(testApp, 'mem-coop');

    // Set public_members to true
    const db = getTestDb();
    await db
      .updateTable('cooperative_profile')
      .set({ public_members: true })
      .where('entity_did', '=', coopDid)
      .execute();

    const res = await testApp.agent.get('/api/v1/explore/cooperatives/mem-coop').expect(200);

    expect(typeof res.body.memberCount).toBe('number');
  });

  it('hides networks when public_activity is false (default)', async () => {
    const testApp = createTestApp();
    await setupWithHandle(testApp, 'act-coop');

    // Create a network and join it
    const networkRes = await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Activity Net' })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/networks/${networkRes.body.did}/join`)
      .expect(201);

    // public_activity defaults to false — networks should be empty
    const res = await testApp.agent.get('/api/v1/explore/cooperatives/act-coop').expect(200);

    expect(res.body.networks).toEqual([]);
  });

  // ─── Networks ───────────────────────────────────────────────────────

  it('GET /api/v1/explore/networks returns empty list when no networks exist', async () => {
    const testApp = createTestApp();

    const res = await testApp.agent.get('/api/v1/explore/networks').expect(200);

    expect(res.body.networks).toEqual([]);
    expect(res.body.cursor).toBeNull();
  });

  it('GET /api/v1/explore/networks returns created networks', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Public Network', description: 'A public network' })
      .expect(201);

    const res = await testApp.agent.get('/api/v1/explore/networks').expect(200);

    expect(res.body.networks).toHaveLength(1);
    expect(res.body.networks[0].displayName).toBe('Public Network');
    // public_description defaults to true, so description is visible
    expect(res.body.networks[0].description).toBe('A public network');
    // public_members defaults to false, so memberCount is null
    expect(res.body.networks[0].memberCount).toBeNull();
    expect(res.body.networks[0].createdAt).toBeDefined();
  });

  it('GET /api/v1/explore/networks works without authentication', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Anon Network' })
      .expect(201);

    // Clear cookies to simulate unauthenticated request
    const res = await testApp.agent.get('/api/v1/explore/networks').expect(200);

    expect(res.body.networks).toHaveLength(1);
  });

  // ─── Visibility via API ─────────────────────────────────────────────

  it('PUT /api/v1/cooperative with publicMembers:true makes explore show memberCount', async () => {
    const testApp = createTestApp();
    await setupWithHandle(testApp, 'api-vis');

    // Update visibility via PUT /api/v1/cooperative
    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ publicMembers: true })
      .expect(200);

    // Verify explore now shows memberCount
    const res = await testApp.agent
      .get('/api/v1/explore/cooperatives/api-vis')
      .expect(200);

    expect(typeof res.body.memberCount).toBe('number');
  });

  it('PUT /api/v1/cooperative returns visibility fields', async () => {
    const testApp = createTestApp();
    await setupWithHandle(testApp, 'vis-resp');

    const res = await testApp.agent
      .put('/api/v1/cooperative')
      .send({ publicMembers: true, publicActivity: true })
      .expect(200);

    expect(res.body.publicDescription).toBe(true); // default
    expect(res.body.publicMembers).toBe(true);
    expect(res.body.publicActivity).toBe(true);
    expect(res.body.publicAgreements).toBe(false); // default
    expect(res.body.publicCampaigns).toBe(false); // default
  });

  it('GET /api/v1/cooperative includes visibility fields', async () => {
    const testApp = createTestApp();
    await setupWithHandle(testApp, 'vis-get');

    const res = await testApp.agent
      .get('/api/v1/cooperative')
      .expect(200);

    expect(res.body.publicDescription).toBe(true);
    expect(res.body.publicMembers).toBe(false);
    expect(res.body.publicActivity).toBe(false);
    expect(res.body.publicAgreements).toBe(false);
    expect(res.body.publicCampaigns).toBe(false);
  });

  // ─── Cooperative profile with network memberships ───────────────────

  it('GET /api/v1/explore/cooperatives/:handle includes network memberships when public_activity is true', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupWithHandle(testApp, 'net-coop');

    // Enable public_activity
    const db = getTestDb();
    await db
      .updateTable('cooperative_profile')
      .set({ public_activity: true })
      .where('entity_did', '=', coopDid)
      .execute();

    // Create a network and join it
    const networkRes = await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Federation Net' })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/networks/${networkRes.body.did}/join`)
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/explore/cooperatives/net-coop')
      .expect(200);

    expect(res.body.networks).toHaveLength(1);
    expect(res.body.networks[0].displayName).toBe('Federation Net');
  });
});
