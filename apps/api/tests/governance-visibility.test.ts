import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PermissionedRecordWritePort } from '@coopsource/spaces-consumer';
import { parseSpaceRecordUri } from '@coopsource/spaces-consumer';
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

    const res = await testApp.agent.get('/api/v1/cooperative').expect(200);

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
    const res = await testApp.agent.get('/api/v1/cooperative').expect(200);

    expect(res.body.governanceVisibility).toBe('mixed');
  });

  it('VisibilityRouter returns correct tier for each mode', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);

    // Default is 'open' → Tier 1
    const openResult = await testApp.container.visibilityRouter.routeWrite({
      cooperativeDid: coopDid,
      collection: 'network.coopsource.governance.proposal',
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
      collection: 'network.coopsource.governance.proposal',
      record: { data: 'private' },
      createdBy: 'did:web:test',
    });
    expect(closedResult.tier).toBe(2);
    expect(closedResult.space).toEqual({
      arbiterDid: coopDid,
      spaceKey: 'members',
      expectedSpaceType: 'network.coopsource.org.spaceType.members',
    });

    // Set to 'mixed' without override → Tier 1 (default)
    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'mixed' })
      .expect(200);

    const mixedResult = await testApp.container.visibilityRouter.routeWrite({
      cooperativeDid: coopDid,
      collection: 'network.coopsource.governance.proposal',
      record: { data: 'mixed' },
      createdBy: 'did:web:test',
    });
    expect(mixedResult.tier).toBe(1);

    // Mixed with private override → Tier 2
    const mixedPrivateResult =
      await testApp.container.visibilityRouter.routeWrite({
        cooperativeDid: coopDid,
        collection: 'network.coopsource.governance.vote',
        record: { data: 'forced-private' },
        createdBy: 'did:web:test',
        visibilityOverride: 'private',
      });
    expect(mixedPrivateResult.tier).toBe(2);
    expect(mixedPrivateResult.space).toMatchObject({
      arbiterDid: coopDid,
      spaceKey: 'members',
    });

    // Open with public override → Tier 1
    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'closed' })
      .expect(200);

    const publicOverrideResult =
      await testApp.container.visibilityRouter.routeWrite({
        cooperativeDid: coopDid,
        collection: 'network.coopsource.governance.proposal',
        record: { data: 'forced-public' },
        createdBy: 'did:web:test',
        visibilityOverride: 'public',
      });
    expect(publicOverrideResult.tier).toBe(1);

    const privateRows = await testApp.container.db
      .selectFrom('private_record')
      .select('rkey')
      .execute();
    expect(privateRows).toHaveLength(0);
  });

  it('routes votes for closed governance to private records', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'closed' })
      .expect(200);

    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Closed vote',
        body: 'This vote should not hit the public repo',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);

    const voteRes = await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .send({ choice: 'yes', rationale: 'Private vote' })
      .expect(201);

    const vote = await testApp.container.db
      .selectFrom('vote')
      .where('id', '=', voteRes.body.id)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(vote.cid).toBe('private');
    expect(parseSpaceRecordUri(vote.uri)).toMatchObject({
      spaceDid: coopDid,
      spaceType: 'network.coopsource.org.spaceType.members',
      skey: 'members',
      authorDid: adminDid,
      collection: 'network.coopsource.governance.vote',
    });

    const privateVote = await testApp.container.db
      .selectFrom('private_record')
      .where('did', '=', coopDid)
      .where('collection', '=', 'network.coopsource.governance.vote')
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(privateVote.created_by).toBe(adminDid);
    const privateVoteRecord =
      typeof privateVote.record === 'string'
        ? JSON.parse(privateVote.record)
        : privateVote.record;
    expect(privateVoteRecord).toMatchObject({
      proposal: expect.stringContaining('/space/'),
      choice: 'yes',
      rationale: 'Private vote',
    });

    const voteWarnings = warnSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('[MemberWriteProxy]') &&
        call[0].includes('governance.vote'),
    );
    expect(voteWarnings).toHaveLength(0);

    warnSpy.mockRestore();
  });

  it('does not persist closed governance proposals when permissioned write fails', async () => {
    const testApp = createTestApp({
      permissionedRecordWriter: new FailingPermissionedRecordWriter(),
    });
    const { coopDid } = await setupAndLogin(testApp);

    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'closed' })
      .expect(200);

    await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Failed private proposal',
        body: 'This should not persist',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(500);

    const proposals = await testApp.container.db
      .selectFrom('proposal')
      .where('cooperative_did', '=', coopDid)
      .select('id')
      .execute();
    expect(proposals).toHaveLength(0);
  });
});

class FailingPermissionedRecordWriter implements PermissionedRecordWritePort {
  async createRecord(): Promise<never> {
    await Promise.resolve();
    throw new Error('permissioned write unavailable');
  }
}
