import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Private Records', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('creates a private record (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/private/records')
      .send({
        collection: 'network.coopsource.governance.draft',
        record: { title: 'Draft Proposal', body: 'Content here' },
      })
      .expect(201);

    expect(res.body.collection).toBe('network.coopsource.governance.draft');
    expect(res.body.rkey).toBeDefined();
    expect(res.body.record.title).toBe('Draft Proposal');
    expect(res.body.createdBy).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.updatedAt).toBeDefined();
  });

  it('creates a record with explicit rkey', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/private/records')
      .send({
        collection: 'network.coopsource.governance.draft',
        rkey: 'my-custom-key',
        record: { title: 'Custom Key Record' },
      })
      .expect(201);

    expect(res.body.rkey).toBe('my-custom-key');
  });

  it('auto-generates rkey when not provided', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/private/records')
      .send({
        collection: 'network.coopsource.governance.draft',
        record: { title: 'Auto Key' },
      })
      .expect(201);

    expect(res.body.rkey).toBeDefined();
    expect(res.body.rkey.length).toBeGreaterThan(0);
  });

  it('lists records with optional collection filter', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/private/records')
      .send({
        collection: 'network.coopsource.governance.draft',
        record: { title: 'Draft 1' },
      })
      .expect(201);

    await testApp.agent
      .post('/api/v1/private/records')
      .send({
        collection: 'network.coopsource.financial.budget',
        record: { amount: 1000 },
      })
      .expect(201);

    // List all
    const allRes = await testApp.agent
      .get('/api/v1/private/records')
      .expect(200);
    expect(allRes.body.records).toHaveLength(2);

    // Filter by collection
    const filteredRes = await testApp.agent
      .get('/api/v1/private/records?collection=network.coopsource.financial.budget')
      .expect(200);
    expect(filteredRes.body.records).toHaveLength(1);
    expect(filteredRes.body.records[0].record.amount).toBe(1000);
  });

  it('gets a single record by collection and rkey', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/private/records')
      .send({
        collection: 'network.coopsource.governance.draft',
        rkey: 'test-get',
        record: { title: 'Get Me' },
      })
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/private/records/${createRes.body.collection}/${createRes.body.rkey}`)
      .expect(200);

    expect(res.body.record.title).toBe('Get Me');
  });

  it('updates a record', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/private/records')
      .send({
        collection: 'network.coopsource.governance.draft',
        rkey: 'update-me',
        record: { title: 'Original' },
      })
      .expect(201);

    const res = await testApp.agent
      .put('/api/v1/private/records/network.coopsource.governance.draft/update-me')
      .send({ record: { title: 'Updated' } })
      .expect(200);

    expect(res.body.record.title).toBe('Updated');
  });

  it('deletes a record (204)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/private/records')
      .send({
        collection: 'network.coopsource.governance.draft',
        rkey: 'delete-me',
        record: { title: 'Temporary' },
      })
      .expect(201);

    await testApp.agent
      .delete('/api/v1/private/records/network.coopsource.governance.draft/delete-me')
      .expect(204);

    // Verify it's gone
    await testApp.agent
      .get('/api/v1/private/records/network.coopsource.governance.draft/delete-me')
      .expect(404);
  });

  it('returns 404 for non-existent record (GET)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .get('/api/v1/private/records/nonexistent.collection/nonexistent-rkey')
      .expect(404);
  });

  it('returns 404 when updating non-existent record', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .put('/api/v1/private/records/nonexistent.collection/nonexistent-rkey')
      .send({ record: { title: 'Nope' } })
      .expect(404);
  });

  it('returns 404 when deleting non-existent record', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .delete('/api/v1/private/records/nonexistent.collection/nonexistent-rkey')
      .expect(404);
  });

  it('returns 409 for duplicate rkey in same collection', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/private/records')
      .send({
        collection: 'network.coopsource.governance.draft',
        rkey: 'duplicate',
        record: { title: 'First' },
      })
      .expect(201);

    await testApp.agent
      .post('/api/v1/private/records')
      .send({
        collection: 'network.coopsource.governance.draft',
        rkey: 'duplicate',
        record: { title: 'Second' },
      })
      .expect(409);
  });

  it('scopes records to cooperative (cannot see other coop records)', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);

    // Create a record via the API (scoped to logged-in coop)
    await testApp.agent
      .post('/api/v1/private/records')
      .send({
        collection: 'network.coopsource.governance.draft',
        rkey: 'scoped-record',
        record: { title: 'Scoped' },
      })
      .expect(201);

    // Insert a record for a different coop directly in DB
    await testApp.container.db
      .insertInto('private_record')
      .values({
        did: 'did:web:other-coop.example.com',
        collection: 'network.coopsource.governance.draft',
        rkey: 'other-record',
        record: JSON.stringify({ title: 'Other Coop' }),
        created_by: 'did:web:other-user',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();

    // List should only return our coop's records
    const res = await testApp.agent
      .get('/api/v1/private/records')
      .expect(200);

    expect(res.body.records).toHaveLength(1);
    expect(res.body.records[0].did).toBe(coopDid);
  });

  it('read access works without private.manage permission', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Create a record as admin
    await testApp.agent
      .post('/api/v1/private/records')
      .send({
        collection: 'network.coopsource.governance.draft',
        rkey: 'readable',
        record: { title: 'Readable' },
      })
      .expect(201);

    // Register a regular member (no private.manage)
    await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'member@test.com', roles: ['member'] })
      .expect(201);

    // Get the invitation token
    const invitations = await testApp.container.db
      .selectFrom('invitation')
      .where('invitee_email', '=', 'member@test.com')
      .selectAll()
      .execute();
    const token = invitations[0]!.token;

    // Accept invitation
    await testApp.agent
      .post(`/api/v1/invitations/${token}/accept`)
      .send({
        displayName: 'Regular Member',
        password: 'password123',
      })
      .expect(201);

    // Login as the member
    await testApp.agent
      .post('/api/v1/auth/login')
      .send({ email: 'member@test.com', password: 'password123' })
      .expect(200);

    // Read should work
    const res = await testApp.agent
      .get('/api/v1/private/records')
      .expect(200);

    expect(res.body.records).toHaveLength(1);
  });

  it('write access requires private.manage permission', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Invite and register a regular member
    await testApp.agent
      .post('/api/v1/invitations')
      .send({ email: 'writer@test.com', roles: ['member'] })
      .expect(201);

    const invitations = await testApp.container.db
      .selectFrom('invitation')
      .where('invitee_email', '=', 'writer@test.com')
      .selectAll()
      .execute();
    const token = invitations[0]!.token;

    await testApp.agent
      .post(`/api/v1/invitations/${token}/accept`)
      .send({
        displayName: 'Writer Member',
        password: 'password123',
      })
      .expect(201);

    // Login as the member
    await testApp.agent
      .post('/api/v1/auth/login')
      .send({ email: 'writer@test.com', password: 'password123' })
      .expect(200);

    // Write should be denied (403)
    await testApp.agent
      .post('/api/v1/private/records')
      .send({
        collection: 'network.coopsource.governance.draft',
        record: { title: 'Denied' },
      })
      .expect(403);
  });
});
