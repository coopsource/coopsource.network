import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

/**
 * Audit N-1 — `GET /api/v1/cooperative` must return the caller's cooperative.
 *
 * It selected the first `entity` of type `cooperative` with status `active`,
 * with no actor predicate and no `ORDER BY`. A network is a cooperative in the
 * recursive model, so creating one is enough to add a second qualifying row —
 * and after any update to the real co-op, the unordered scan returned the other
 * one permanently.
 */
async function createNetwork(testApp: TestApp, name: string): Promise<string> {
  const res = await testApp.agent.post('/api/v1/networks').send({ name });
  expect(res.status).toBe(201);
  return res.body.did as string;
}

describe('Cooperative identity (N-1)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('keeps returning the caller’s cooperative after it is updated', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);
    await createNetwork(testApp, 'Beta Network');

    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ displayName: 'Alpha Coop', website: 'https://alpha.example' })
      .expect(200);

    // The update rewrites the row, which moved its heap tuple behind the other
    // cooperative's and flipped the unordered scan for good.
    for (let i = 0; i < 5; i++) {
      const res = await testApp.agent.get('/api/v1/cooperative').expect(200);
      expect(res.body.did, `read ${i}`).toBe(coopDid);
    }
  });

  it('describes the cooperative it just wrote to in its own response', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);
    await createNetwork(testApp, 'Beta Network');

    const res = await testApp.agent
      .put('/api/v1/cooperative')
      .send({ displayName: 'Alpha Coop', website: 'https://alpha.example' })
      .expect(200);

    expect(res.body.did).toBe(coopDid);
    expect(res.body.displayName).toBe('Alpha Coop');
    expect(res.body.website).toBe('https://alpha.example');
  });

  it('does not expose another cooperative’s visibility flags', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);
    const betaDid = await createNetwork(testApp, 'Beta Network');

    // Give the other cooperative a distinctive, more exposed configuration.
    await getTestDb()
      .updateTable('cooperative_profile')
      .set({ public_members: true, public_activity: true, anon_discoverable: true })
      .where('entity_did', '=', betaDid)
      .execute();
    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ displayName: 'Alpha Coop' })
      .expect(200);

    const res = await testApp.agent.get('/api/v1/cooperative').expect(200);
    expect(res.body.did).toBe(coopDid);

    // The settings form prefills from this response; reading the other
    // cooperative's flags here is how they get copied onto the caller's own.
    const mine = await getTestDb()
      .selectFrom('cooperative_profile')
      .where('entity_did', '=', coopDid)
      .select(['public_members', 'public_activity', 'anon_discoverable'])
      .executeTakeFirstOrThrow();
    expect(res.body.publicMembers).toBe(mine.public_members);
    expect(res.body.publicActivity).toBe(mine.public_activity);
    expect(res.body.anonDiscoverable).toBe(mine.anon_discoverable);
  });
});
