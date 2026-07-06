import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DID } from '@coopsource/common';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { membershipAuthorityFailure } from '../src/services/membership-read-model.js';

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
    await testApp.agent.post(`/api/v1/networks/${networkDid}/join`).expect(201);

    // Check network members
    const membersRes = await testApp.agent
      .get(`/api/v1/networks/${networkDid}/members`)
      .expect(200);

    expect(membersRes.body.members).toHaveLength(1);
    expect(membersRes.body.members[0].did).toBe(coopDid);

    const detailRes = await testApp.agent
      .get(`/api/v1/networks/${networkDid}`)
      .expect(200);
    expect(detailRes.body.memberCount).toBe(1);
  });

  it('POST /api/v1/networks/:did/join returns 409 if already member', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Dup Network' })
      .expect(201);

    const networkDid = createRes.body.did;

    await testApp.agent.post(`/api/v1/networks/${networkDid}/join`).expect(201);

    // Try joining again
    await testApp.agent.post(`/api/v1/networks/${networkDid}/join`).expect(409);
  });

  it('GET /api/v1/networks/:did/members surfaces degraded spaces authority', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Partial Network' })
      .expect(201);

    const spy = vi
      .spyOn(testApp.container.membershipReadModel, 'listMembersResult')
      .mockResolvedValue(
        membershipAuthorityFailure(
          'partial',
          'Membership authority returned a partial result',
        ),
      );

    try {
      const res = await testApp.agent
        .get(`/api/v1/networks/${createRes.body.did}/members`)
        .expect(503);

      expect(res.body).toMatchObject({
        error: 'SPACES_AUTHORITY_UNAVAILABLE',
        axis: 'spaces',
        reason: 'partial',
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('POST /api/v1/networks/:did/join fails closed when membership authority is stale', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Stale Network' })
      .expect(201);
    const networkDid = createRes.body.did as string;

    const original =
      testApp.container.membershipReadModel.getActiveMembershipResult.bind(
        testApp.container.membershipReadModel,
      );
    const spy = vi
      .spyOn(testApp.container.membershipReadModel, 'getActiveMembershipResult')
      .mockImplementation((cooperativeDid, memberDid) => {
        if (cooperativeDid === (networkDid as DID) && memberDid === coopDid) {
          return Promise.resolve(
            membershipAuthorityFailure(
              'stale',
              'Membership authority returned stale data',
            ),
          );
        }
        return original(cooperativeDid, memberDid);
      });

    try {
      const res = await testApp.agent
        .post(`/api/v1/networks/${networkDid}/join`)
        .expect(503);

      expect(res.body).toMatchObject({
        error: 'SPACES_AUTHORITY_UNAVAILABLE',
        axis: 'spaces',
        reason: 'stale',
      });
    } finally {
      spy.mockRestore();
    }
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
    await testApp.agent.post(`/api/v1/networks/${networkDid}/join`).expect(201);

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

    await testApp.agent.post('/api/v1/networks').send({}).expect(400);
  });
});
