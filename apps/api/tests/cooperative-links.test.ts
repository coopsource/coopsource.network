import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

/** Helper: create a second cooperative entity for link testing */
async function createTargetCoop(db: ReturnType<typeof getTestDb>): Promise<string> {
  const targetDid = 'did:web:target-coop.example.com';
  const now = new Date();

  // Insert entity
  await db
    .insertInto('entity')
    .values({
      did: targetDid,
      type: 'cooperative',
      display_name: 'Target Cooperative',
      status: 'active',
      created_at: now,
      indexed_at: now,
    })
    .onConflict((oc) => oc.column('did').doNothing())
    .execute();

  return targetDid;
}

describe('Cooperative Links API', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  // ─── Create ──────────────────────────────────────────────────────────

  it('creates a cooperative link (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);
    const targetDid = await createTargetCoop(testApp.container.db);

    const res = await testApp.agent
      .post('/api/v1/cooperative-links')
      .send({
        targetDid,
        linkType: 'partnership',
        description: 'Strategic partnership',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.targetDid).toBe(targetDid);
    expect(res.body.linkType).toBe('partnership');
    expect(res.body.status).toBe('pending');
    expect(res.body.description).toBe('Strategic partnership');
  });

  // ─── Accept ──────────────────────────────────────────────────────────

  it('accepts a cooperative link (200)', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);
    const targetDid = await createTargetCoop(testApp.container.db);

    const createRes = await testApp.agent
      .post('/api/v1/cooperative-links')
      .send({ targetDid, linkType: 'federation' })
      .expect(201);

    // Respond as target coop — use service directly since we can't auth as another coop
    const row = await testApp.container.cooperativeLinkService.respondToLink(
      createRes.body.id,
      targetDid,
      true,
      'Happy to connect!',
    );

    expect(row.status).toBe('active');
    expect(row.responded_at).toBeDefined();
  });

  // ─── Decline ─────────────────────────────────────────────────────────

  it('declines a cooperative link (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);
    const targetDid = await createTargetCoop(testApp.container.db);

    const createRes = await testApp.agent
      .post('/api/v1/cooperative-links')
      .send({ targetDid, linkType: 'supply_chain' })
      .expect(201);

    const row = await testApp.container.cooperativeLinkService.respondToLink(
      createRes.body.id,
      targetDid,
      false,
    );

    expect(row.status).toBe('declined');
  });

  // ─── Dissolve ────────────────────────────────────────────────────────

  it('dissolves a cooperative link (200)', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);
    const targetDid = await createTargetCoop(testApp.container.db);

    const createRes = await testApp.agent
      .post('/api/v1/cooperative-links')
      .send({ targetDid, linkType: 'partnership' })
      .expect(201);

    // Accept the link first
    await testApp.container.cooperativeLinkService.respondToLink(
      createRes.body.id,
      targetDid,
      true,
    );

    // Dissolve via API (as initiator)
    const res = await testApp.agent
      .delete(`/api/v1/cooperative-links/${createRes.body.id}`)
      .expect(200);

    expect(res.body.status).toBe('dissolved');
    expect(res.body.dissolvedAt).toBeDefined();
  });

  // ─── Duplicate prevention ───────────────────────────────────────────

  it('prevents duplicate links (A→B and B→A blocked) (409)', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);
    const targetDid = await createTargetCoop(testApp.container.db);

    // Create A→B
    await testApp.agent
      .post('/api/v1/cooperative-links')
      .send({ targetDid, linkType: 'partnership' })
      .expect(201);

    // Try A→B again — should fail
    await testApp.agent
      .post('/api/v1/cooperative-links')
      .send({ targetDid, linkType: 'federation' })
      .expect(409);

    // Try B→A via service — should also fail
    try {
      await testApp.container.cooperativeLinkService.createLink(targetDid, {
        targetDid: coopDid,
        linkType: 'partnership',
      });
      expect.fail('Should have thrown ConflictError');
    } catch (err: unknown) {
      expect((err as Error).message).toContain('already exists');
    }
  });

  // ─── Self-link prevention ──────────────────────────────────────────

  it('prevents self-link (400)', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/cooperative-links')
      .send({ targetDid: coopDid, linkType: 'partnership' })
      .expect(400);
  });

  // ─── Target not found ──────────────────────────────────────────────

  it('returns 404 for non-existent target (404)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/cooperative-links')
      .send({
        targetDid: 'did:web:nonexistent.example.com',
        linkType: 'partnership',
      })
      .expect(404);
  });

  // ─── Only target can respond ───────────────────────────────────────

  it('only target can respond to link (403)', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);
    const targetDid = await createTargetCoop(testApp.container.db);

    const createRes = await testApp.agent
      .post('/api/v1/cooperative-links')
      .send({ targetDid, linkType: 'partnership' })
      .expect(201);

    // Try responding as initiator via service — should fail
    try {
      await testApp.container.cooperativeLinkService.respondToLink(
        createRes.body.id,
        coopDid,
        true,
      );
      expect.fail('Should have thrown UnauthorizedError');
    } catch (err: unknown) {
      expect((err as Error).message).toContain('target cooperative');
    }
  });

  // ─── List with filters ────────────────────────────────────────────

  it('lists links with filters (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);
    const targetDid = await createTargetCoop(testApp.container.db);

    await testApp.agent
      .post('/api/v1/cooperative-links')
      .send({ targetDid, linkType: 'partnership' })
      .expect(201);

    // List all
    const allRes = await testApp.agent
      .get('/api/v1/cooperative-links')
      .expect(200);

    expect(allRes.body.links).toHaveLength(1);

    // Filter by status
    const pendingRes = await testApp.agent
      .get('/api/v1/cooperative-links?status=pending')
      .expect(200);

    expect(pendingRes.body.links).toHaveLength(1);

    const activeRes = await testApp.agent
      .get('/api/v1/cooperative-links?status=active')
      .expect(200);

    expect(activeRes.body.links).toHaveLength(0);
  });

  // ─── Partners endpoint ─────────────────────────────────────────────

  it('lists partners with entity names (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);
    const targetDid = await createTargetCoop(testApp.container.db);

    const createRes = await testApp.agent
      .post('/api/v1/cooperative-links')
      .send({ targetDid, linkType: 'partnership' })
      .expect(201);

    // Accept the link
    await testApp.container.cooperativeLinkService.respondToLink(
      createRes.body.id,
      targetDid,
      true,
    );

    const res = await testApp.agent
      .get('/api/v1/cooperative-links/partners')
      .expect(200);

    expect(res.body.partners).toHaveLength(1);
    expect(res.body.partners[0].partnerDid).toBe(targetDid);
    expect(res.body.partners[0].displayName).toBe('Target Cooperative');
    expect(res.body.partners[0].linkType).toBe('partnership');
  });
});
