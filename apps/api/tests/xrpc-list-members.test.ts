import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('network.coopsource.org.listMembers', () => {
  let testApp: TestApp;
  let coopDid: string;
  let adminDid: string;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
    const setup = await setupAndLogin(testApp);
    coopDid = setup.coopDid;
    adminDid = setup.adminDid;
  });

  async function insertMember(opts: {
    did: string;
    displayName: string;
    directoryVisible: boolean;
  }) {
    const now = new Date();
    await testApp.container.db
      .insertInto('entity')
      .values({
        did: opts.did,
        type: 'person',
        display_name: opts.displayName,
        status: 'active',
        created_at: now,
        indexed_at: now,
      })
      .onConflict((oc) => oc.column('did').doNothing())
      .execute();

    await testApp.container.db
      .insertInto('membership')
      .values({
        member_did: opts.did,
        cooperative_did: coopDid,
        status: 'active',
        directory_visible: opts.directoryVisible,
        joined_at: now,
        created_at: now,
        indexed_at: now,
      })
      .execute();
  }

  describe('unauthenticated (no session)', () => {
    it('returns only directory-visible members', async () => {
      await insertMember({
        did: 'did:plc:visible1',
        displayName: 'Visible Alice',
        directoryVisible: true,
      });

      const bare = supertest(testApp.app);
      const res = await bare
        .get('/xrpc/network.coopsource.org.listMembers')
        .query({ cooperative: coopDid })
        .expect(200);

      expect(res.body.members).toHaveLength(1);
      expect(res.body.members[0]).toMatchObject({
        did: 'did:plc:visible1',
        displayName: 'Visible Alice',
        private: false,
      });
    });

    it('returns empty list when no directory-visible members', async () => {
      const bare = supertest(testApp.app);
      const res = await bare
        .get('/xrpc/network.coopsource.org.listMembers')
        .query({ cooperative: coopDid })
        .expect(200);

      expect(res.body.members).toEqual([]);
    });
  });

  describe('authenticated fellow member', () => {
    it('returns all members with full detail regardless of directory_visible', async () => {
      await insertMember({
        did: 'did:plc:privatefellow',
        displayName: 'Private Fellow',
        directoryVisible: false,
      });

      const res = await testApp.agent
        .get('/xrpc/network.coopsource.org.listMembers')
        .query({ cooperative: coopDid })
        .expect(200);

      // Admin (from setupAndLogin) + the inserted member = 2
      expect(res.body.members).toHaveLength(2);

      const fellow = res.body.members.find(
        (m: { did: string }) => m.did === 'did:plc:privatefellow',
      );
      expect(fellow).toMatchObject({
        did: 'did:plc:privatefellow',
        displayName: 'Private Fellow',
        private: false,
      });
    });
  });

  it('returns 404 for closed-governance cooperative (unauthenticated)', async () => {
    await testApp.container.db
      .updateTable('cooperative_profile')
      .set({ governance_visibility: 'closed' })
      .where('entity_did', '=', coopDid)
      .execute();

    const bare = supertest(testApp.app);
    await bare
      .get('/xrpc/network.coopsource.org.listMembers')
      .query({ cooperative: coopDid })
      .expect(404);
  });

  it('returns members for closed-governance cooperative when authenticated as member', async () => {
    await insertMember({
      did: 'did:plc:closedmember',
      displayName: 'Closed Coop Fellow',
      directoryVisible: true,
    });

    await testApp.container.db
      .updateTable('cooperative_profile')
      .set({ governance_visibility: 'closed' })
      .where('entity_did', '=', coopDid)
      .execute();

    const res = await testApp.agent
      .get('/xrpc/network.coopsource.org.listMembers')
      .query({ cooperative: coopDid })
      .expect(200);

    // Admin (from setupAndLogin) + the inserted member = 2
    expect(res.body.members).toHaveLength(2);
    const fellow = res.body.members.find(
      (m: { did: string }) => m.did === 'did:plc:closedmember',
    );
    expect(fellow).toMatchObject({
      did: 'did:plc:closedmember',
      displayName: 'Closed Coop Fellow',
    });
  });
});
