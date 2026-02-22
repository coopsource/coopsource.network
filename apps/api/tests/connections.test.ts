import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'kysely';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('External Connections', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  // ─── Connections ──────────────────────────────────────────────────

  it('lists connections (empty)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .get('/api/v1/connections')
      .expect(200);

    expect(res.body.connections).toHaveLength(0);
  });

  it('lists available services (none configured in test)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .get('/api/v1/connections/available')
      .expect(200);

    // No services configured in test environment
    expect(res.body.services).toEqual([]);
  });

  it('rejects initiate without configured service', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/connections/initiate')
      .send({ service: 'github' })
      .expect(400);
  });

  it('requires authentication for connections', async () => {
    const testApp = createTestApp();

    await testApp.agent.get('/api/v1/connections').expect(401);
    await testApp.agent.get('/api/v1/connections/available').expect(401);
    await testApp.agent.post('/api/v1/connections/initiate').expect(401);
  });

  // ─── Direct DB Tests (bypass OAuth) ───────────────────────────────

  it('revokes a connection via direct DB insertion', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);
    const db = getTestDb();

    // Insert a connection directly (simulating completed OAuth)
    const uri = `at://${adminDid}/network.coopsource.connection.link/test1`;
    await db
      .insertInto('external_connection')
      .values({
        uri,
        did: adminDid,
        rkey: 'test1',
        service: 'github',
        status: 'active',
        oauth_token_encrypted: null,
        metadata: JSON.stringify({ login: 'testuser' }),
        created_at: new Date(),
        indexed_at: new Date(),
      })
      .execute();

    // Verify it shows up
    const list = await testApp.agent
      .get('/api/v1/connections')
      .expect(200);
    expect(list.body.connections).toHaveLength(1);
    expect(list.body.connections[0].service).toBe('github');

    // Revoke it
    await testApp.agent
      .delete(`/api/v1/connections/${encodeURIComponent(uri)}`)
      .expect(204);

    // Verify it's revoked
    const after = await testApp.agent
      .get('/api/v1/connections')
      .expect(200);
    expect(after.body.connections[0].status).toBe('revoked');
  });

  // ─── Bindings ─────────────────────────────────────────────────────

  it('creates and lists bindings for a connection', async () => {
    const testApp = createTestApp();
    const { adminDid, coopDid } = await setupAndLogin(testApp);
    const db = getTestDb();

    // Insert a connection directly
    const connUri = `at://${adminDid}/network.coopsource.connection.link/test2`;
    await db
      .insertInto('external_connection')
      .values({
        uri: connUri,
        did: adminDid,
        rkey: 'test2',
        service: 'github',
        status: 'active',
        oauth_token_encrypted: null,
        metadata: JSON.stringify({ login: 'testuser' }),
        created_at: new Date(),
        indexed_at: new Date(),
      })
      .execute();

    // Bind a resource
    const bindRes = await testApp.agent
      .post(`/api/v1/connections/${encodeURIComponent(connUri)}/bind`)
      .send({
        projectUri: coopDid,
        resourceType: 'github_repo',
        resourceId: 'org/repo',
        metadata: { displayName: 'My Repo', url: 'https://github.com/org/repo' },
      })
      .expect(201);

    expect(bindRes.body.uri).toBeDefined();
    expect(bindRes.body.resourceType).toBe('github_repo');
    expect(bindRes.body.resourceId).toBe('org/repo');
    expect(bindRes.body.projectUri).toBe(coopDid);

    // List bindings
    const listRes = await testApp.agent
      .get(`/api/v1/connections/${encodeURIComponent(connUri)}/bindings`)
      .expect(200);

    expect(listRes.body.bindings).toHaveLength(1);
  });

  it('removes a binding', async () => {
    const testApp = createTestApp();
    const { adminDid, coopDid } = await setupAndLogin(testApp);
    const db = getTestDb();

    // Insert a connection
    const connUri = `at://${adminDid}/network.coopsource.connection.link/test3`;
    await db
      .insertInto('external_connection')
      .values({
        uri: connUri,
        did: adminDid,
        rkey: 'test3',
        service: 'github',
        status: 'active',
        oauth_token_encrypted: null,
        metadata: JSON.stringify({ login: 'testuser' }),
        created_at: new Date(),
        indexed_at: new Date(),
      })
      .execute();

    // Bind a resource
    const bindRes = await testApp.agent
      .post(`/api/v1/connections/${encodeURIComponent(connUri)}/bind`)
      .send({
        projectUri: coopDid,
        resourceType: 'github_repo',
        resourceId: 'org/repo2',
      })
      .expect(201);

    // Remove the binding
    await testApp.agent
      .delete(`/api/v1/connections/bindings/${encodeURIComponent(bindRes.body.uri)}`)
      .expect(204);

    // Verify it's gone
    const listRes = await testApp.agent
      .get(`/api/v1/connections/${encodeURIComponent(connUri)}/bindings`)
      .expect(200);

    expect(listRes.body.bindings).toHaveLength(0);
  });

  it('rejects binding to a revoked connection', async () => {
    const testApp = createTestApp();
    const { adminDid, coopDid } = await setupAndLogin(testApp);
    const db = getTestDb();

    // Insert a revoked connection
    const connUri = `at://${adminDid}/network.coopsource.connection.link/test4`;
    await db
      .insertInto('external_connection')
      .values({
        uri: connUri,
        did: adminDid,
        rkey: 'test4',
        service: 'github',
        status: 'revoked',
        oauth_token_encrypted: null,
        metadata: JSON.stringify({}),
        created_at: new Date(),
        indexed_at: new Date(),
      })
      .execute();

    await testApp.agent
      .post(`/api/v1/connections/${encodeURIComponent(connUri)}/bind`)
      .send({
        projectUri: coopDid,
        resourceType: 'github_repo',
        resourceId: 'org/repo',
      })
      .expect(400);
  });
});
