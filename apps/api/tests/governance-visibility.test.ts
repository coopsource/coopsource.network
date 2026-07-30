import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DID } from '@coopsource/common';
import type { PermissionedRecordWritePort } from '@coopsource/spaces-consumer';
import {
  InMemoryPermissionedRecordWritePort,
  parseSpaceRecordUri,
} from '@coopsource/spaces-consumer';
import { LEXICON_IDS } from '@coopsource/lexicons';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import type {
  GovernanceRecordPlacementPort,
  GovernanceRecordPlacementRequest,
} from '../src/services/governance-record-placement-port.js';

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
    expect(res.body.publicGovernanceAnchors).toBe(false);
    expect(res.body.publicGovernanceAnchorOutcomes).toBe(false);
  });

  it('defaults public governance anchors to disabled', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);

    const profile = await testApp.container.db
      .selectFrom('cooperative_profile')
      .where('entity_did', '=', coopDid)
      .select([
        'public_governance_anchors',
        'public_governance_anchor_outcomes',
      ])
      .executeTakeFirstOrThrow();

    expect(profile.public_governance_anchors).toBe(false);
    expect(profile.public_governance_anchor_outcomes).toBe(false);
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

  it('updates public governance anchor policy flags', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);

    const res = await testApp.agent
      .put('/api/v1/cooperative')
      .send({
        publicGovernanceAnchors: true,
        publicGovernanceAnchorOutcomes: true,
      })
      .expect(200);

    expect(res.body.publicGovernanceAnchors).toBe(true);
    expect(res.body.publicGovernanceAnchorOutcomes).toBe(true);

    const profile = await testApp.container.db
      .selectFrom('cooperative_profile')
      .where('entity_did', '=', coopDid)
      .select([
        'public_governance_anchors',
        'public_governance_anchor_outcomes',
      ])
      .executeTakeFirstOrThrow();

    expect(profile.public_governance_anchors).toBe(true);
    expect(profile.public_governance_anchor_outcomes).toBe(true);
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

  it('governance placement resolves the correct target for each mode', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);

    // Open governance defaults to the public repository.
    const openResult =
      await testApp.container.governanceRecordPlacement.resolveWritePlacement({
        cooperativeDid: coopDid,
        collection: 'network.coopsource.governance.proposal',
      });
    expect(openResult.kind).toBe('public-repo');

    // Closed governance selects the members space.
    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'closed' })
      .expect(200);

    const closedResult =
      await testApp.container.governanceRecordPlacement.resolveWritePlacement({
        cooperativeDid: coopDid,
        collection: 'network.coopsource.governance.proposal',
      });
    expect(closedResult.kind).toBe('permissioned-space');
    expect(closedResult.space).toEqual({
      arbiterDid: coopDid,
      spaceKey: 'members',
      expectedSpaceType: 'network.coopsource.org.spaceType.members',
    });

    // Mixed governance remains public without a per-record override.
    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'mixed' })
      .expect(200);

    const mixedResult =
      await testApp.container.governanceRecordPlacement.resolveWritePlacement({
        cooperativeDid: coopDid,
        collection: 'network.coopsource.governance.proposal',
      });
    expect(mixedResult.kind).toBe('public-repo');

    // A private override selects the members space.
    const mixedPrivateResult =
      await testApp.container.governanceRecordPlacement.resolveWritePlacement({
        cooperativeDid: coopDid,
        collection: 'network.coopsource.governance.vote',
        visibilityOverride: 'private',
      });
    expect(mixedPrivateResult.kind).toBe('permissioned-space');
    expect(mixedPrivateResult.space).toMatchObject({
      arbiterDid: coopDid,
      spaceKey: 'members',
    });

    // A public override wins over the closed default.
    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'closed' })
      .expect(200);

    const publicOverrideResult =
      await testApp.container.governanceRecordPlacement.resolveWritePlacement({
        cooperativeDid: coopDid,
        collection: 'network.coopsource.governance.proposal',
        visibilityOverride: 'public',
      });
    expect(publicOverrideResult.kind).toBe('public-repo');

    const privateRows = await testApp.container.db
      .selectFrom('private_record')
      .select('rkey')
      .execute();
    expect(privateRows).toHaveLength(0);
  });

  it('uses an injected placement policy for proposal and vote writes', async () => {
    const requests: GovernanceRecordPlacementRequest[] = [];
    const writer = new InMemoryPermissionedRecordWritePort();
    const governanceRecordPlacement: GovernanceRecordPlacementPort = {
      async resolveWritePlacement(request) {
        await Promise.resolve();
        requests.push(request);
        return {
          kind: 'permissioned-space',
          space: {
            arbiterDid: request.cooperativeDid as DID,
            spaceKey: 'members',
            expectedSpaceType: 'network.coopsource.org.spaceType.members',
          },
        };
      },
    };
    const testApp = createTestApp({
      governanceRecordPlacement,
      permissionedRecordWriter: writer,
    });
    const { coopDid, adminDid } = await setupAndLogin(testApp);

    const proposal = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Explicit placement',
        body: 'The placement port owns this decision.',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${proposal.body.id}/open`)
      .expect(200);
    const vote = await testApp.agent
      .post(`/api/v1/proposals/${proposal.body.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    expect(requests).toEqual([
      {
        cooperativeDid: coopDid,
        collection: 'network.coopsource.governance.proposal',
      },
      {
        cooperativeDid: coopDid,
        collection: 'network.coopsource.governance.vote',
      },
    ]);
    const proposalRow = await testApp.container.db
      .selectFrom('proposal')
      .where('id', '=', proposal.body.id)
      .select('uri')
      .executeTakeFirstOrThrow();
    expect(parseSpaceRecordUri(proposalRow.uri!)).toMatchObject({
      spaceDid: coopDid,
      authorDid: adminDid,
      collection: 'network.coopsource.governance.proposal',
    });
    const voteRow = await testApp.container.db
      .selectFrom('vote')
      .where('id', '=', vote.body.id)
      .select('uri')
      .executeTakeFirstOrThrow();
    expect(parseSpaceRecordUri(voteRow.uri)).toMatchObject({
      spaceDid: coopDid,
      authorDid: adminDid,
      collection: 'network.coopsource.governance.vote',
    });
    expect(writer.writtenRecords()).toHaveLength(2);
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

  it('updates closed-governance draft proposal source records in private storage', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'closed' })
      .expect(200);

    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Closed draft',
        body: 'Original private body',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    const proposalRow = await testApp.container.db
      .selectFrom('proposal')
      .where('id', '=', proposalRes.body.id)
      .select(['uri'])
      .executeTakeFirstOrThrow();
    const location = parseSpaceRecordUri(proposalRow.uri!);
    expect(location).not.toBeNull();

    await testApp.agent
      .put(`/api/v1/proposals/${proposalRes.body.id}`)
      .send({ title: 'Updated closed draft', tags: ['private'] })
      .expect(200);

    const privateRows = await testApp.container.db
      .selectFrom('private_record')
      .where('did', '=', coopDid)
      .where('collection', '=', 'network.coopsource.governance.proposal')
      .selectAll()
      .execute();
    expect(privateRows).toHaveLength(1);
    expect(privateRows[0]!.rkey).toBe(
      `${encodeURIComponent(adminDid)}/${encodeURIComponent(location!.rkey)}`,
    );
    const privateRecord =
      typeof privateRows[0]!.record === 'string'
        ? JSON.parse(privateRows[0]!.record)
        : privateRows[0]!.record;
    expect(privateRecord).toMatchObject({
      title: 'Updated closed draft',
      tags: ['private'],
    });
  });

  it('deletes closed-governance proposal source records from private storage', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);

    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'closed' })
      .expect(200);

    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Closed delete',
        body: 'Private proposal body',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    await testApp.agent
      .delete(`/api/v1/proposals/${proposalRes.body.id}`)
      .expect(204);

    const privateRows = await testApp.container.db
      .selectFrom('private_record')
      .where('did', '=', coopDid)
      .where('collection', '=', 'network.coopsource.governance.proposal')
      .select('rkey')
      .execute();
    expect(privateRows).toHaveLength(0);
  });

  it('deletes the superseded private vote record when a closed-governance member revotes', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'closed' })
      .expect(200);

    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Closed revote',
        body: 'Only the latest private vote should remain',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);

    const firstVoteRes = await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);
    const firstVote = await testApp.container.db
      .selectFrom('vote')
      .where('id', '=', firstVoteRes.body.id)
      .select('uri')
      .executeTakeFirstOrThrow();
    expect(firstVote.uri).not.toBeNull();
    const firstVoteLocation = parseSpaceRecordUri(firstVote.uri!);
    expect(firstVoteLocation).not.toBeNull();

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .send({ choice: 'no' })
      .expect(201);

    const activePrivateVotes = await testApp.container.db
      .selectFrom('private_record')
      .where('collection', '=', 'network.coopsource.governance.vote')
      .selectAll()
      .execute();
    expect(activePrivateVotes).toHaveLength(1);
    expect(activePrivateVotes[0]!.rkey).not.toBe(firstVoteLocation!.rkey);
    const activePrivateVoteRecord =
      typeof activePrivateVotes[0]!.record === 'string'
        ? JSON.parse(activePrivateVotes[0]!.record)
        : activePrivateVotes[0]!.record;
    expect(activePrivateVoteRecord).toMatchObject({ choice: 'no' });

    const votes = await testApp.container.db
      .selectFrom('vote')
      .where('proposal_id', '=', proposalRes.body.id)
      .select(['uri', 'choice', 'retracted_at'])
      .execute();
    expect(votes).toHaveLength(2);
    expect(votes.filter((vote) => vote.retracted_at === null)).toHaveLength(1);
  });

  it('cleans up the newly-created permissioned vote when closed revote retraction fails', async () => {
    let blockedDeleteRkey: string | null = null;
    const writer = new InMemoryPermissionedRecordWritePort({
      beforeDelete: ({ collection, rkey }) => {
        if (
          collection === 'network.coopsource.governance.vote' &&
          rkey === blockedDeleteRkey
        ) {
          throw new Error('old vote delete failed');
        }
      },
    });
    const testApp = createTestApp({ permissionedRecordWriter: writer });
    await setupAndLogin(testApp);

    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'closed' })
      .expect(200);

    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Failed revote cleanup',
        body: 'Failed retraction should not orphan the replacement',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);
    const firstVoteRes = await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);
    const firstVote = await testApp.container.db
      .selectFrom('vote')
      .where('id', '=', firstVoteRes.body.id)
      .select('uri')
      .executeTakeFirstOrThrow();
    blockedDeleteRkey = parseSpaceRecordUri(firstVote.uri!)!.rkey;

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .send({ choice: 'no' })
      .expect(500);

    const storedVotes = writer
      .writtenRecords()
      .filter(
        (record) =>
          record.location.collection === 'network.coopsource.governance.vote',
      );
    expect(storedVotes).toHaveLength(1);
    expect(storedVotes[0]!.record).toMatchObject({ choice: 'yes' });

    const votes = await testApp.container.db
      .selectFrom('vote')
      .where('proposal_id', '=', proposalRes.body.id)
      .select(['choice', 'retracted_at'])
      .execute();
    expect(votes).toEqual([
      expect.objectContaining({ choice: 'yes', retracted_at: null }),
    ]);
  });

  it('deletes the private vote record when a closed-governance member retracts a vote', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'closed' })
      .expect(200);

    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Closed retract',
        body: 'Retracting should clear the private vote record',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);
    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    await testApp.agent
      .delete(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .expect(204);

    const activePrivateVotes = await testApp.container.db
      .selectFrom('private_record')
      .where('collection', '=', 'network.coopsource.governance.vote')
      .select('rkey')
      .execute();
    expect(activePrivateVotes).toHaveLength(0);
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

  it('does not emit public governance labels for permissioned-space proposals', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);

    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'closed' })
      .expect(200);

    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Private resolution',
        body: 'Resolution should stay private',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);
    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);
    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/close`)
      .expect(200);
    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/resolve`)
      .expect(200);

    const proposal = await testApp.container.db
      .selectFrom('proposal')
      .where('id', '=', proposalRes.body.id)
      .select(['uri', 'cid'])
      .executeTakeFirstOrThrow();
    expect(proposal.cid).toBe('private');
    expect(parseSpaceRecordUri(proposal.uri)).toMatchObject({
      spaceDid: coopDid,
      collection: 'network.coopsource.governance.proposal',
    });

    const labels = await testApp.container.db
      .selectFrom('governance_label')
      .where('subject_uri', '=', proposal.uri)
      .selectAll()
      .execute();
    expect(labels).toHaveLength(0);

    const anchors = await testApp.container.db
      .selectFrom('public_governance_anchor')
      .where('proposal_id', '=', proposalRes.body.id)
      .selectAll()
      .execute();
    expect(anchors).toHaveLength(0);
  });

  it('publishes closed-governance anchors and labels the anchor when explicitly enabled', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);

    await testApp.agent
      .put('/api/v1/cooperative')
      .send({
        governanceVisibility: 'closed',
        publicGovernanceAnchors: true,
        publicGovernanceAnchorOutcomes: true,
      })
      .expect(200);

    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Private anchored resolution',
        body: 'Private proposal content must not be in the anchor',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    const draftAnchors = await testApp.container.db
      .selectFrom('public_governance_anchor')
      .where('proposal_id', '=', proposalRes.body.id)
      .selectAll()
      .execute();
    expect(draftAnchors).toHaveLength(0);

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);

    const openedAnchor = await testApp.container.db
      .selectFrom('public_governance_anchor')
      .where('proposal_id', '=', proposalRes.body.id)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(openedAnchor.cooperative_did).toBe(coopDid);
    expect(openedAnchor.status).toBe('open');
    expect(openedAnchor.outcome).toBeNull();

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .send({ choice: 'yes', rationale: 'Private rationale' })
      .expect(201);
    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/close`)
      .expect(200);

    const closedAnchor = await testApp.container.db
      .selectFrom('public_governance_anchor')
      .where('proposal_id', '=', proposalRes.body.id)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(closedAnchor.anchor_uri).toBe(openedAnchor.anchor_uri);
    expect(closedAnchor.status).toBe('closed');
    expect(closedAnchor.outcome).toBeNull();

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/resolve`)
      .expect(200);

    const resolvedAnchor = await testApp.container.db
      .selectFrom('public_governance_anchor')
      .where('proposal_id', '=', proposalRes.body.id)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(resolvedAnchor.anchor_uri).toBe(openedAnchor.anchor_uri);
    expect(resolvedAnchor.status).toBe('resolved');
    expect(resolvedAnchor.outcome).toBe('passed');

    const proposal = await testApp.container.db
      .selectFrom('proposal')
      .where('id', '=', proposalRes.body.id)
      .select(['uri'])
      .executeTakeFirstOrThrow();
    const labelsOnPrivateProposal = await testApp.container.db
      .selectFrom('governance_label')
      .where('subject_uri', '=', proposal.uri)
      .selectAll()
      .execute();
    expect(labelsOnPrivateProposal).toHaveLength(0);

    const labelsOnAnchor = await testApp.container.db
      .selectFrom('governance_label')
      .where('subject_uri', '=', resolvedAnchor.anchor_uri)
      .selectAll()
      .execute();
    expect(labelsOnAnchor).toHaveLength(1);
    expect(labelsOnAnchor[0]!.label_value).toBe('proposal-approved');

    const publicRecord = await testApp.container.db
      .selectFrom('pds_record')
      .where('uri', '=', resolvedAnchor.anchor_uri)
      .select('content')
      .executeTakeFirstOrThrow();
    const anchorRecord =
      typeof publicRecord.content === 'string'
        ? JSON.parse(publicRecord.content)
        : publicRecord.content;
    expect(anchorRecord).toMatchObject({
      $type: LEXICON_IDS.GovernanceProposalAnchor,
      cooperativeDid: coopDid,
      proposalId: proposalRes.body.id,
      status: 'resolved',
      outcome: 'passed',
      anchorVersion: 1,
    });
    expect(anchorRecord).not.toHaveProperty('title');
    expect(anchorRecord).not.toHaveProperty('body');
    expect(anchorRecord).not.toHaveProperty('options');
    expect(anchorRecord).not.toHaveProperty('authorDid');
    expect(anchorRecord).not.toHaveProperty('privateProposalUri');
    expect(anchorRecord).not.toHaveProperty('voterDids');
    expect(anchorRecord).not.toHaveProperty('tally');
  });

  it('does not emit private proposal outcome labels when anchor outcomes are disabled', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .put('/api/v1/cooperative')
      .send({
        governanceVisibility: 'closed',
        publicGovernanceAnchors: true,
        publicGovernanceAnchorOutcomes: false,
      })
      .expect(200);

    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Private anchor without outcome',
        body: 'Outcome labels should stay private',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);
    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);
    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/close`)
      .expect(200);
    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/resolve`)
      .expect(200);

    const anchor = await testApp.container.db
      .selectFrom('public_governance_anchor')
      .where('proposal_id', '=', proposalRes.body.id)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(anchor.status).toBe('resolved');
    expect(anchor.outcome).toBeNull();

    const labels = await testApp.container.db
      .selectFrom('governance_label')
      .selectAll()
      .execute();
    expect(labels).toHaveLength(0);
  });
});

class FailingPermissionedRecordWriter implements PermissionedRecordWritePort {
  async createRecord(): Promise<never> {
    await Promise.resolve();
    throw new Error('permissioned write unavailable');
  }

  async updateRecord(): Promise<never> {
    await Promise.resolve();
    throw new Error('permissioned update unavailable');
  }

  async deleteRecord(): Promise<never> {
    await Promise.resolve();
    throw new Error('permissioned delete unavailable');
  }
}
