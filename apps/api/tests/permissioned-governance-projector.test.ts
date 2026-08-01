import type { AtUri, CID, DID } from '@coopsource/common';
import {
  formatPermissionedRecordLocationUri,
  type SpaceRef,
  type VerifiedPermissionedRecord,
} from '@coopsource/spaces-consumer';
import { beforeEach, describe, expect, it } from 'vitest';
import { indexProposal } from '../src/appview/indexers/proposal-indexer.js';
import { projectPermissionedGovernanceChange } from '../src/appview/permissioned-governance-projector.js';
import { createTestApp, type TestApp } from './helpers/test-app.js';
import { truncateAllTables } from './helpers/test-db.js';

const cooperativeDid = 'did:plc:coop' as DID;
const otherCooperativeDid = 'did:plc:other' as DID;
const aliceDid = 'did:plc:alice' as DID;
const bobDid = 'did:plc:bob' as DID;
const space: SpaceRef = {
  arbiterDid: cooperativeDid,
  expectedSpaceType: 'network.coopsource.org.spaceType.members',
  spaceKey: 'members',
};
const now = new Date('2026-07-30T12:00:00Z');

describe('permissioned governance projection', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    await truncateAllTables();
    testApp = createTestApp();
    await testApp.container.db
      .insertInto('entity')
      .values([
        entity(cooperativeDid, 'cooperative'),
        entity(otherCooperativeDid, 'cooperative'),
        entity(aliceDid, 'person'),
        entity(bobDid, 'person'),
      ])
      .execute();
    await testApp.container.db
      .insertInto('membership')
      .values([membership(aliceDid), membership(bobDid)])
      .execute();
  });

  it('inserts a proposal and replays votes without changing the API response shape', async () => {
    const proposal = proposalChange();
    const proposalUri = formatPermissionedRecordLocationUri(proposal.location);
    await projectPermissionedGovernanceChange(
      testApp.container.db,
      proposal,
      now,
    );
    const vote = voteChange(proposalUri, 'yes');

    await projectPermissionedGovernanceChange(testApp.container.db, vote, now);
    await projectPermissionedGovernanceChange(
      testApp.container.db,
      vote,
      new Date('2026-07-30T12:01:00Z'),
    );

    const projected = await testApp.container.proposalService.getProposalByUri(
      proposalUri,
      cooperativeDid,
    );
    expect(projected).toMatchObject({
      proposal: {
        uri: proposalUri,
        cooperative_did: cooperativeDid,
        author_did: aliceDid,
        title: 'Permissioned proposal',
        body: 'Vote on this',
        status: 'draft',
      },
      voteSummary: { yes: 1 },
    });
    expect(projected?.votes).toHaveLength(1);
    expect(projected?.votes[0]).toMatchObject({
      voter_did: bobDid,
      choice: 'yes',
      retracted_at: null,
    });
  });

  it('updates a replayed vote in place and retracts it on tombstone', async () => {
    const proposal = proposalChange();
    const proposalUri = formatPermissionedRecordLocationUri(proposal.location);
    await projectPermissionedGovernanceChange(
      testApp.container.db,
      proposal,
      now,
    );
    const vote = voteChange(proposalUri, 'yes');
    await projectPermissionedGovernanceChange(testApp.container.db, vote, now);
    await projectPermissionedGovernanceChange(
      testApp.container.db,
      {
        ...vote,
        operation: 'update',
        cid: 'bafy-vote-2' as CID,
        record: { ...vote.record, choice: 'no' },
      },
      new Date('2026-07-30T12:01:00Z'),
    );

    const updated = await testApp.container.proposalService.getProposalByUri(
      proposalUri,
      cooperativeDid,
    );
    expect(updated?.voteSummary).toEqual({ no: 1 });
    expect(updated?.votes).toHaveLength(1);

    await projectPermissionedGovernanceChange(
      testApp.container.db,
      {
        operation: 'delete',
        location: vote.location,
        previousCid: 'bafy-vote-2' as CID,
        sourceRevision: '4',
      },
      new Date('2026-07-30T12:02:00Z'),
    );
    const retracted = await testApp.container.proposalService.getProposalByUri(
      proposalUri,
      cooperativeDid,
    );
    expect(retracted?.voteSummary).toEqual({});
    expect(retracted?.votes).toEqual([]);
  });

  it('blocks checkpoint progress until a referenced proposal is projected', async () => {
    await expect(
      projectPermissionedGovernanceChange(
        testApp.container.db,
        voteChange('at://did:plc:coop/missing/proposal', 'yes'),
        now,
      ),
    ).rejects.toThrow('references an unprojected proposal');
  });

  it('rejects a vote record that declares a different voter', async () => {
    const proposal = proposalChange();
    const proposalUri = formatPermissionedRecordLocationUri(proposal.location);
    await projectPermissionedGovernanceChange(
      testApp.container.db,
      proposal,
      now,
    );
    const vote = voteChange(proposalUri, 'yes');

    await expect(
      projectPermissionedGovernanceChange(
        testApp.container.db,
        {
          ...vote,
          record: { ...vote.record, voterDid: aliceDid },
        },
        now,
      ),
    ).rejects.toThrow(`expected ${bobDid}`);
  });

  it('rejects proposal ownership outside the containing cooperative space', async () => {
    await expect(
      projectPermissionedGovernanceChange(
        testApp.container.db,
        {
          ...proposalChange(),
          record: {
            ...proposalChange().record,
            cooperative: 'did:plc:other',
          },
        },
        now,
      ),
    ).rejects.toThrow(`expected ${cooperativeDid}`);
  });

  it('rejects a vote for an indexed proposal owned by another cooperative', async () => {
    const otherProposalUri =
      'at://did:plc:alice/network.coopsource.governance.proposal/other';
    await indexProposal(
      testApp.container.db,
      {
        seq: 1,
        did: aliceDid,
        operation: 'create',
        uri: otherProposalUri as AtUri,
        cid: 'bafy-proposal' as CID,
        record: {
          cooperative: otherCooperativeDid,
          title: 'Other cooperative proposal',
          body: 'Must not accept votes from the first cooperative space',
          createdAt: now.toISOString(),
        },
        time: now.toISOString(),
      },
      // Stands in for a proposal the other cooperative projected from its own
      // space; the public-path acceptance gate (C-01) would otherwise discard
      // this seeding because alice is not a member of that cooperative.
      { authorityVerified: true },
    );

    await expect(
      projectPermissionedGovernanceChange(
        testApp.container.db,
        voteChange(otherProposalUri, 'yes'),
        now,
      ),
    ).rejects.toThrow(`expected ${cooperativeDid}`);
  });

  it('rejects malformed votes and stale proposal strong references', async () => {
    const proposal = proposalChange();
    const proposalUri = formatPermissionedRecordLocationUri(proposal.location);
    await projectPermissionedGovernanceChange(
      testApp.container.db,
      proposal,
      now,
    );
    const vote = voteChange(proposalUri, 'yes');

    await expect(
      projectPermissionedGovernanceChange(
        testApp.container.db,
        {
          ...vote,
          record: { ...vote.record, choice: undefined },
        },
        now,
      ),
    ).rejects.toThrow('missing required vote fields');
    await expect(
      projectPermissionedGovernanceChange(
        testApp.container.db,
        {
          ...vote,
          record: { ...vote.record, proposalCid: 'bafy-stale' },
        },
        now,
      ),
    ).rejects.toThrow('expected bafy-proposal');
  });
});

function proposalChange(): Extract<
  VerifiedPermissionedRecord,
  { operation: 'create' | 'update' }
> {
  return {
    operation: 'create',
    location: {
      space,
      authorDid: aliceDid,
      collection: 'network.coopsource.governance.proposal',
      rkey: 'proposal-1',
    },
    cid: 'bafy-proposal' as CID,
    record: {
      $type: 'network.coopsource.governance.proposal',
      cooperative: cooperativeDid,
      title: 'Permissioned proposal',
      body: 'Vote on this',
      bodyFormat: 'text',
      votingType: 'binary',
      quorumType: 'simpleMajority',
      quorumBasis: 'votesCast',
      createdAt: now.toISOString(),
    },
    sourceRevision: '2',
  };
}

function voteChange(
  proposalUri: string,
  choice: string,
): Extract<VerifiedPermissionedRecord, { operation: 'create' | 'update' }> {
  return {
    operation: 'create',
    location: {
      space,
      authorDid: bobDid,
      collection: 'network.coopsource.governance.vote',
      rkey: 'vote-1',
    },
    cid: 'bafy-vote-1' as CID,
    record: {
      $type: 'network.coopsource.governance.vote',
      proposal: proposalUri,
      proposalCid: 'bafy-proposal',
      choice,
      createdAt: now.toISOString(),
    },
    sourceRevision: '3',
  };
}

function entity(did: DID, type: 'cooperative' | 'person') {
  return {
    did,
    type,
    display_name: did,
    status: 'active',
    created_at: now,
    indexed_at: now,
  };
}

function membership(memberDid: DID) {
  return {
    member_did: memberDid,
    cooperative_did: cooperativeDid,
    status: 'active',
    member_class: null,
    directory_visible: false,
    joined_at: now,
    created_at: now,
    indexed_at: now,
  };
}
