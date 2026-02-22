import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';

describe('Networks', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it('GET /api/v1/networks returns empty list initially', async () => {
    const testApp = createTestApp();
    const res = await testApp.agent.get('/api/v1/networks').expect(200);

    expect(res.body.networks).toEqual([]);
    expect(res.body.cursor).toBeNull();
  });

  it('POST /api/v1/networks creates a network (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Test Network', description: 'A test network' })
      .expect(201);

    expect(res.body.did).toBeDefined();
    expect(res.body.did).toMatch(/^did:/);
  });

  it('GET /api/v1/networks lists created networks', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Network Alpha' })
      .expect(201);

    const res = await testApp.agent.get('/api/v1/networks').expect(200);

    expect(res.body.networks).toHaveLength(1);
    expect(res.body.networks[0].displayName).toBe('Network Alpha');
    expect(res.body.networks[0].memberCount).toBe(0);
  });

  it('GET /api/v1/networks/:did returns network detail', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Detail Network', description: 'Description' })
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/networks/${createRes.body.did}`)
      .expect(200);

    expect(res.body.displayName).toBe('Detail Network');
    expect(res.body.description).toBe('Description');
    expect(res.body.memberCount).toBe(0);
    expect(res.body.createdAt).toBeDefined();
  });

  it('POST /api/v1/networks/:did/join joins co-op to network', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Joinable Network' })
      .expect(201);

    const networkDid = createRes.body.did;

    // Join the network
    await testApp.agent
      .post(`/api/v1/networks/${networkDid}/join`)
      .expect(201);

    // Check network members
    const membersRes = await testApp.agent
      .get(`/api/v1/networks/${networkDid}/members`)
      .expect(200);

    expect(membersRes.body.members).toHaveLength(1);
    expect(membersRes.body.members[0].did).toBe(coopDid);
  });

  it('POST /api/v1/networks/:did/join returns 409 if already member', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Dup Network' })
      .expect(201);

    const networkDid = createRes.body.did;

    await testApp.agent
      .post(`/api/v1/networks/${networkDid}/join`)
      .expect(201);

    // Try joining again
    await testApp.agent
      .post(`/api/v1/networks/${networkDid}/join`)
      .expect(409);
  });

  it('DELETE /api/v1/networks/:did/leave removes co-op from network', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Leave Network' })
      .expect(201);

    const networkDid = createRes.body.did;

    // Join
    await testApp.agent
      .post(`/api/v1/networks/${networkDid}/join`)
      .expect(201);

    // Leave
    await testApp.agent
      .delete(`/api/v1/networks/${networkDid}/leave`)
      .expect(204);

    // Members should be empty
    const membersRes = await testApp.agent
      .get(`/api/v1/networks/${networkDid}/members`)
      .expect(200);

    expect(membersRes.body.members).toHaveLength(0);
  });

  it('POST /api/v1/networks returns 400 when name is missing', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/networks')
      .send({})
      .expect(400);
  });
});
