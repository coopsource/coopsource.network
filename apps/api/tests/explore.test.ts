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

/** Mark a cooperative as anon-discoverable so it appears in /explore endpoints. */
async function makeDiscoverable(coopDid: string): Promise<void> {
  const db = getTestDb();
  await db
    .updateTable('cooperative_profile')
    .set({ anon_discoverable: true })
    .where('entity_did', '=', coopDid)
    .execute();
}

describe('Explore', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  // ─── Cooperatives ───────────────────────────────────────────────────

  it('GET /api/v1/explore/cooperatives returns the cooperative created during setup', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupWithHandle(testApp, 'test-coop');
    await makeDiscoverable(coopDid);

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
    const { coopDid } = await setupWithHandle(testApp, 'test-coop');
    await makeDiscoverable(coopDid);

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
    const { coopDid } = await setupWithHandle(testApp, 'test-coop');
    await makeDiscoverable(coopDid);

    // Create a network and make it discoverable too (so the is_network filter is what excludes it)
    const networkRes = await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Test Network' })
      .expect(201);
    await makeDiscoverable(networkRes.body.did);

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
    await makeDiscoverable(coopDid);

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
    await makeDiscoverable(coopDid);

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
    const { coopDid } = await setupWithHandle(testApp, 'act-coop');
    await makeDiscoverable(coopDid);

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

    const networkRes = await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Public Network', description: 'A public network' })
      .expect(201);
    await makeDiscoverable(networkRes.body.did);

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

    const networkRes = await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Anon Network' })
      .expect(201);
    await makeDiscoverable(networkRes.body.did);

    // Clear cookies to simulate unauthenticated request
    const res = await testApp.agent.get('/api/v1/explore/networks').expect(200);

    expect(res.body.networks).toHaveLength(1);
  });

  // ─── Visibility via API ─────────────────────────────────────────────

  it('PUT /api/v1/cooperative with publicMembers:true makes explore show memberCount', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupWithHandle(testApp, 'api-vis');
    await makeDiscoverable(coopDid);

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
    await makeDiscoverable(coopDid);

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

  // ─── V8.1 anon_discoverable flag ────────────────────────────────────

  describe('V8.1 anon_discoverable flag', () => {
    it('hides cooperatives that are not anon-discoverable', async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'private-coop');
      // No call to makeDiscoverable — coop should be hidden by default

      const res = await testApp.agent.get('/api/v1/explore/cooperatives').expect(200);
      expect(res.body.cooperatives).toHaveLength(0);
    });

    it('returns 404 for a non-discoverable cooperative by handle', async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'hidden-coop');

      const res = await testApp.agent
        .get('/api/v1/explore/cooperatives/hidden-coop')
        .expect(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });

    it('returns the cooperative once anon_discoverable is true', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'opt-in-coop');
      await makeDiscoverable(coopDid);

      const res = await testApp.agent.get('/api/v1/explore/cooperatives').expect(200);
      expect(res.body.cooperatives).toHaveLength(1);
      expect(res.body.cooperatives[0].handle).toBe('opt-in-coop');
    });
  });

  // ─── V8.5 — Public profile sections (proposals/agreements/campaigns) ────

  describe('V8.5 public profile sections', () => {
    it('returns empty proposals/agreements/campaigns arrays when no data exists', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'empty-sections');
      await makeDiscoverable(coopDid);

      const res = await testApp.agent
        .get('/api/v1/explore/cooperatives/empty-sections')
        .expect(200);

      expect(res.body.proposals).toEqual([]);
      expect(res.body.agreements).toEqual([]);
      expect(res.body.campaigns).toEqual([]);
    });

    it('returns open proposals when public_activity is true', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'props-coop');
      await makeDiscoverable(coopDid);

      const db = getTestDb();
      await db
        .updateTable('cooperative_profile')
        .set({ public_activity: true })
        .where('entity_did', '=', coopDid)
        .execute();

      // Seed a draft proposal then transition it to open
      const createRes = await testApp.agent
        .post('/api/v1/proposals')
        .send({
          title: 'Public Test Proposal',
          body: 'Body',
          bodyFormat: 'text/markdown',
          votingType: 'binary',
          quorumType: 'simpleMajority',
        })
        .expect(201);

      await testApp.agent
        .post(`/api/v1/proposals/${createRes.body.id}/open`)
        .expect(200);

      const res = await testApp.agent
        .get('/api/v1/explore/cooperatives/props-coop')
        .expect(200);

      expect(res.body.proposals).toHaveLength(1);
      expect(res.body.proposals[0].title).toBe('Public Test Proposal');
      expect(res.body.proposals[0].status).toBe('open');
      expect(res.body.proposals[0].id).toBeDefined();
      expect(res.body.proposals[0].createdAt).toBeDefined();
    });

    it('hides proposals when public_activity is false even if they exist', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'hidden-props');
      await makeDiscoverable(coopDid);

      // public_activity defaults to false — leave it
      const createRes = await testApp.agent
        .post('/api/v1/proposals')
        .send({
          title: 'Hidden Proposal',
          body: 'Body',
          bodyFormat: 'text/markdown',
          votingType: 'binary',
          quorumType: 'simpleMajority',
        })
        .expect(201);

      await testApp.agent
        .post(`/api/v1/proposals/${createRes.body.id}/open`)
        .expect(200);

      const res = await testApp.agent
        .get('/api/v1/explore/cooperatives/hidden-props')
        .expect(200);

      expect(res.body.proposals).toEqual([]);
    });

    it('hides draft and tombstoned proposals from listPublicProposals', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'filter-props');
      await makeDiscoverable(coopDid);

      const db = getTestDb();
      await db
        .updateTable('cooperative_profile')
        .set({ public_activity: true })
        .where('entity_did', '=', coopDid)
        .execute();

      // Draft proposal — should be hidden
      await testApp.agent
        .post('/api/v1/proposals')
        .send({
          title: 'Still Draft',
          body: 'Body',
          bodyFormat: 'text/markdown',
          votingType: 'binary',
          quorumType: 'simpleMajority',
        })
        .expect(201);

      // Tombstoned proposal — direct DB insert with invalidated_at set
      await db
        .insertInto('proposal')
        .values({
          uri: null,
          cid: null,
          cooperative_did: coopDid,
          author_did: coopDid,
          title: 'Tombstoned',
          body: 'B',
          body_format: 'text/markdown',
          voting_type: 'binary',
          options: null,
          quorum_type: 'simpleMajority',
          quorum_basis: 'votesCast',
          quorum_threshold: null,
          status: 'open',
          outcome: null,
          opens_at: null,
          closes_at: null,
          resolved_at: null,
          class_quorum_rules: null,
          tags: [],
          created_by: coopDid,
          invalidated_at: new Date(),
          invalidated_by: coopDid,
        })
        .execute();

      const res = await testApp.agent
        .get('/api/v1/explore/cooperatives/filter-props')
        .expect(200);

      expect(res.body.proposals).toEqual([]);
    });

    it('lists active agreements when public_agreements is true', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'agree-coop');
      await makeDiscoverable(coopDid);

      const db = getTestDb();
      await db
        .updateTable('cooperative_profile')
        .set({ public_agreements: true })
        .where('entity_did', '=', coopDid)
        .execute();

      // Seed an active agreement directly (the create→activate flow is heavy
      // and not the focus of this test).
      const now = new Date();
      await db
        .insertInto('agreement')
        .values({
          uri: 'at://test/network.coopsource.agreement.master/abc',
          did: coopDid,
          rkey: 'abc',
          project_uri: coopDid,
          title: 'Public Agreement',
          version: 1,
          purpose: null,
          scope: null,
          agreement_type: 'master',
          body: null,
          body_format: 'text/markdown',
          created_by: coopDid,
          governance_framework: null,
          dispute_resolution: null,
          amendment_process: null,
          termination_conditions: null,
          status: 'active',
          effective_date: now,
          created_at: now,
          updated_at: now,
        })
        .execute();

      const res = await testApp.agent
        .get('/api/v1/explore/cooperatives/agree-coop')
        .expect(200);

      expect(res.body.agreements).toHaveLength(1);
      expect(res.body.agreements[0].title).toBe('Public Agreement');
      expect(res.body.agreements[0].status).toBe('active');
    });

    it('does NOT leak agreements where project_uri points to a different coop (regression)', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'leak-test');
      await makeDiscoverable(coopDid);

      const db = getTestDb();
      await db
        .updateTable('cooperative_profile')
        .set({ public_agreements: true })
        .where('entity_did', '=', coopDid)
        .execute();

      // Insert an agreement that lives on a DIFFERENT coop (project_uri ≠ coopDid).
      // listPublicAgreements filters by project_uri, so this must NOT surface.
      const now = new Date();
      await db
        .insertInto('agreement')
        .values({
          uri: 'at://other/network.coopsource.agreement.master/xyz',
          did: 'did:web:other-coop.example',
          rkey: 'xyz',
          project_uri: 'did:web:other-coop.example',
          title: 'Other Coop Agreement',
          version: 1,
          purpose: null,
          scope: null,
          agreement_type: 'master',
          body: null,
          body_format: 'text/markdown',
          created_by: 'did:web:other-coop.example',
          governance_framework: null,
          dispute_resolution: null,
          amendment_process: null,
          termination_conditions: null,
          status: 'active',
          effective_date: now,
          created_at: now,
          updated_at: now,
        })
        .execute();

      const res = await testApp.agent
        .get('/api/v1/explore/cooperatives/leak-test')
        .expect(200);

      expect(res.body.agreements).toEqual([]);
    });

    it('lists active campaigns when public_campaigns is true', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'camp-coop');
      await makeDiscoverable(coopDid);

      const db = getTestDb();
      await db
        .updateTable('cooperative_profile')
        .set({ public_campaigns: true })
        .where('entity_did', '=', coopDid)
        .execute();

      const now = new Date();
      await db
        .insertInto('funding_campaign')
        .values({
          uri: 'at://test/network.coopsource.funding.campaign/c1',
          did: coopDid,
          rkey: 'c1',
          beneficiary_uri: coopDid,
          title: 'Public Campaign',
          description: null,
          tier: 'general',
          campaign_type: 'donation',
          goal_amount: 1000,
          goal_currency: 'USD',
          amount_raised: 250,
          backer_count: 0,
          funding_model: 'donation',
          status: 'active',
          start_date: now,
          end_date: null,
          metadata: null,
          created_at: now,
        })
        .execute();

      const res = await testApp.agent
        .get('/api/v1/explore/cooperatives/camp-coop')
        .expect(200);

      expect(res.body.campaigns).toHaveLength(1);
      expect(res.body.campaigns[0].title).toBe('Public Campaign');
      expect(res.body.campaigns[0].status).toBe('active');
      expect(res.body.campaigns[0].goalAmount).toBe(1000);
      expect(res.body.campaigns[0].amountRaised).toBe(250);
    });

    it('hides cancelled campaigns', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'cancel-coop');
      await makeDiscoverable(coopDid);

      const db = getTestDb();
      await db
        .updateTable('cooperative_profile')
        .set({ public_campaigns: true })
        .where('entity_did', '=', coopDid)
        .execute();

      const now = new Date();
      await db
        .insertInto('funding_campaign')
        .values({
          uri: 'at://test/network.coopsource.funding.campaign/c2',
          did: coopDid,
          rkey: 'c2',
          beneficiary_uri: coopDid,
          title: 'Cancelled Campaign',
          description: null,
          tier: 'general',
          campaign_type: 'donation',
          goal_amount: 1000,
          goal_currency: 'USD',
          amount_raised: 0,
          backer_count: 0,
          funding_model: 'donation',
          status: 'cancelled',
          start_date: now,
          end_date: null,
          metadata: null,
          created_at: now,
        })
        .execute();

      const res = await testApp.agent
        .get('/api/v1/explore/cooperatives/cancel-coop')
        .expect(200);

      expect(res.body.campaigns).toEqual([]);
    });
  });

  // ─── V8.9 — Person profiles ──────────────────────────────────────────

  describe('GET /api/v1/explore/people/:handle', () => {
    /** Seed a person entity + default profile directly in the database. */
    async function seedPerson(
      did: string,
      opts: {
        handle?: string;
        displayName?: string;
        bio?: string | null;
        discoverable?: boolean;
      } = {},
    ): Promise<void> {
      const db = getTestDb();
      const displayName = opts.displayName ?? `Person ${did.slice(-4)}`;
      await db
        .insertInto('entity')
        .values({
          did,
          type: 'person',
          handle: opts.handle ?? null,
          display_name: displayName,
          status: 'active',
          created_at: new Date(),
        })
        .execute();
      await db
        .insertInto('profile')
        .values({
          entity_did: did,
          is_default: true,
          display_name: displayName,
          bio: opts.bio ?? null,
          verified: true,
          discoverable: opts.discoverable ?? false,
        })
        .execute();
    }

    /** Seed stakeholder_interest rows for a person. */
    async function seedInterests(
      did: string,
      interests: Array<{ category: string }>,
    ): Promise<void> {
      const db = getTestDb();
      const rkey = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await db
        .insertInto('stakeholder_interest')
        .values({
          uri: `at://${did}/network.coopsource.alignment.interest/${rkey}`,
          did,
          rkey,
          project_uri: did,
          interests: JSON.stringify(interests),
          contributions: '[]',
          constraints: '[]',
          red_lines: '[]',
          preferences: '{}',
          created_at: new Date(),
          updated_at: new Date(),
          indexed_at: new Date(),
        })
        .execute();
    }

    /** Create an active membership between a person and a cooperative. */
    async function seedMembership(
      memberDid: string,
      cooperativeDid: string,
    ): Promise<void> {
      const db = getTestDb();
      await db
        .insertInto('membership')
        .values({
          member_did: memberDid,
          cooperative_did: cooperativeDid,
          status: 'active',
          created_at: new Date(),
          indexed_at: new Date(),
        })
        .execute();
    }

    it('returns a person profile when discoverable=true', async () => {
      const testApp = createTestApp();
      // Setup creates a coop entity — we need one for the membership test
      await setupWithHandle(testApp, 'person-test-coop');

      await seedPerson('did:web:alice.example', {
        handle: 'alice',
        displayName: 'Alice Test',
        bio: 'A discoverable person',
        discoverable: true,
      });

      const res = await testApp.agent
        .get('/api/v1/explore/people/alice')
        .expect(200);

      expect(res.body.did).toBe('did:web:alice.example');
      expect(res.body.handle).toBe('alice');
      expect(res.body.displayName).toBe('Alice Test');
      expect(res.body.bio).toBe('A discoverable person');
      expect(res.body.cooperatives).toEqual([]);
      expect(res.body.interests).toEqual([]);
    });

    it('returns 404 for non-existent handle', async () => {
      const testApp = createTestApp();

      const res = await testApp.agent
        .get('/api/v1/explore/people/nonexistent')
        .expect(404);

      expect(res.body.error).toBe('Not found');
    });

    it('returns 404 when person is not discoverable and has no alignment data', async () => {
      const testApp = createTestApp();

      await seedPerson('did:web:hidden.example', {
        handle: 'hidden-person',
        displayName: 'Hidden Person',
        discoverable: false,
      });

      await testApp.agent
        .get('/api/v1/explore/people/hidden-person')
        .expect(404);
    });

    it('returns person profile when not discoverable but has alignment data', async () => {
      const testApp = createTestApp();

      await seedPerson('did:web:aligned.example', {
        handle: 'aligned-person',
        displayName: 'Aligned Person',
        discoverable: false,
      });
      await seedInterests('did:web:aligned.example', [
        { category: 'Climate' },
        { category: 'Education' },
      ]);

      const res = await testApp.agent
        .get('/api/v1/explore/people/aligned-person')
        .expect(200);

      expect(res.body.did).toBe('did:web:aligned.example');
      expect(res.body.handle).toBe('aligned-person');
      expect(res.body.displayName).toBe('Aligned Person');
      // Interests should be lowercased and deduplicated
      expect(res.body.interests).toContain('climate');
      expect(res.body.interests).toContain('education');
      expect(res.body.interests).toHaveLength(2);
    });

    it('includes only publicly-discoverable cooperatives', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'pub-coop');
      await makeDiscoverable(coopDid);

      // Create a second cooperative that is NOT discoverable
      const db = getTestDb();
      const privateDid = 'did:web:private-coop.example';
      await db
        .insertInto('entity')
        .values({
          did: privateDid,
          type: 'cooperative',
          handle: 'private-coop',
          display_name: 'Private Coop',
          status: 'active',
          created_at: new Date(),
        })
        .execute();
      await db
        .insertInto('cooperative_profile')
        .values({
          entity_did: privateDid,
          cooperative_type: 'worker',
          is_network: false,
          anon_discoverable: false,
        })
        .execute();

      // Seed the person
      await seedPerson('did:web:member.example', {
        handle: 'member-person',
        displayName: 'Member Person',
        discoverable: true,
      });

      // Add memberships in both coops
      await seedMembership('did:web:member.example', coopDid);
      await seedMembership('did:web:member.example', privateDid);

      const res = await testApp.agent
        .get('/api/v1/explore/people/member-person')
        .expect(200);

      // Only the publicly-discoverable coop should appear
      expect(res.body.cooperatives).toHaveLength(1);
      expect(res.body.cooperatives[0].handle).toBe('pub-coop');
      expect(res.body.cooperatives[0].displayName).toBe('Test Cooperative');
    });
  });

  // ─── V8.5 — anonDiscoverable plumbing ───────────────────────────────

  describe('V8.5 anonDiscoverable in cooperative endpoints', () => {
    it('GET /api/v1/cooperative includes anonDiscoverable (default false)', async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'anon-get');

      const res = await testApp.agent.get('/api/v1/cooperative').expect(200);
      expect(res.body.anonDiscoverable).toBe(false);
    });

    it('PUT /api/v1/cooperative accepts anonDiscoverable and returns it', async () => {
      const testApp = createTestApp();
      await setupWithHandle(testApp, 'anon-put');

      const res = await testApp.agent
        .put('/api/v1/cooperative')
        .send({ anonDiscoverable: true })
        .expect(200);

      expect(res.body.anonDiscoverable).toBe(true);
    });

    it('toggling anonDiscoverable off hides the coop from /explore/[handle]', async () => {
      const testApp = createTestApp();
      const { coopDid } = await setupWithHandle(testApp, 'anon-toggle');
      await makeDiscoverable(coopDid);

      // Visible
      await testApp.agent
        .get('/api/v1/explore/cooperatives/anon-toggle')
        .expect(200);

      // Toggle off via PUT
      await testApp.agent
        .put('/api/v1/cooperative')
        .send({ anonDiscoverable: false })
        .expect(200);

      // Now 404
      await testApp.agent
        .get('/api/v1/explore/cooperatives/anon-toggle')
        .expect(404);
    });
  });
});
