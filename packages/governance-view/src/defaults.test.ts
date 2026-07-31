import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GOVERNANCE_PLUGINS,
  createDefaultGovernancePluginSet,
  defaultAnchorSummaryPlugin,
  defaultDelegateChainsPlugin,
  defaultEligibilityPlugin,
  defaultHistoricalStatePlugin,
  defaultMeetingMinutesPlugin,
  defaultPatronageAllocatorPlugin,
  defaultQuorumPlugin,
  defaultSurplusDistributorPlugin,
  defaultVoteWeightPlugin,
  type GovernanceActorRef,
  type GovernanceGroupRef,
  type GovernanceProposalRef,
  type GovernanceTallyInput,
} from './index.js';

const voter: GovernanceActorRef = { did: 'did:plc:voter' };
const cooperative: GovernanceGroupRef = {
  authorityDid: 'did:plc:coop',
  spaceKey: 'members',
  spaceType: 'network.coopsource.org.spaceType.members',
};
const proposal: GovernanceProposalRef = {
  uri: 'at://did:plc:coop/network.coopsource.governance.proposal/abc',
  cid: 'bafyproposal',
  collection: 'network.coopsource.governance.proposal',
};

describe('default governance plugins', () => {
  it('provides all ten plugin surfaces', () => {
    expect(Object.keys(DEFAULT_GOVERNANCE_PLUGINS).sort()).toEqual([
      'actionAuthorizer',
      'anchorSummary',
      'delegateChains',
      'eligibility',
      'historicalState',
      'meetingMinutes',
      'patronageAllocator',
      'quorum',
      'surplusDistributor',
      'voteWeight',
    ]);
  });

  it('uses one-member-one-vote and eligible-by-default behavior', async () => {
    await expect(
      defaultVoteWeightPlugin.weightForVote({
        voter,
        cooperative,
        proposal,
        voteChoice: 'yes',
        at: '2026-07-06T00:00:00.000Z',
      }),
    ).resolves.toEqual({ weight: 1 });
    await expect(
      defaultEligibilityPlugin.canVote({
        voter,
        cooperative,
        proposal,
        at: '2026-07-06T00:00:00.000Z',
      }),
    ).resolves.toEqual({ eligible: true });
  });

  it('evaluates simple headcount quorum defaults', async () => {
    const input: GovernanceTallyInput = {
      proposal,
      cooperative,
      eligibleVoterCount: 3,
      votes: [
        { voter, choice: 'yes' },
        { voter: { did: 'did:plc:second' }, choice: 'yes' },
      ],
      quorum: { type: 'simpleMajority' },
    };

    await expect(defaultQuorumPlugin.evaluate(input)).resolves.toEqual({
      met: true,
      outcomeReason: 'met',
    });
    await expect(
      defaultQuorumPlugin.evaluate({
        ...input,
        votes: [{ voter, choice: 'yes' }],
      }),
    ).resolves.toEqual({ met: false, outcomeReason: 'no_quorum' });
  });

  it('uses explicit semantics for every quorum mode', async () => {
    const votes = [
      { voter, choice: 'yes' },
      { voter: { did: 'did:plc:second' }, choice: 'yes' },
      { voter: { did: 'did:plc:third' }, choice: 'yes' },
    ];
    const input: GovernanceTallyInput = {
      proposal,
      cooperative,
      eligibleVoterCount: 5,
      votes,
    };

    await expect(
      defaultQuorumPlugin.evaluate({
        ...input,
        quorum: { type: 'superMajority' },
      }),
    ).resolves.toEqual({ met: false, outcomeReason: 'no_quorum' });
    await expect(
      defaultQuorumPlugin.evaluate({
        ...input,
        eligibleVoterCount: 3,
        quorum: { type: 'superMajority' },
      }),
    ).resolves.toEqual({ met: true, outcomeReason: 'met' });
    await expect(
      defaultQuorumPlugin.evaluate({
        ...input,
        quorum: { type: 'unanimous' },
      }),
    ).resolves.toEqual({ met: false, outcomeReason: 'no_quorum' });
    await expect(
      defaultQuorumPlugin.evaluate({
        ...input,
        eligibleVoterCount: 4,
        quorum: { type: 'custom', threshold: 0.75 },
      }),
    ).resolves.toEqual({ met: true, outcomeReason: 'met' });
    await expect(
      defaultQuorumPlugin.evaluate({
        ...input,
        quorum: { type: 'custom' },
      }),
    ).resolves.toEqual({ met: false, outcomeReason: 'no_quorum' });
  });

  it('keeps optional plugin surfaces as no-ops', async () => {
    const context = {
      proposal,
      cooperative,
      action: 'resolveProposal',
      actor: voter,
      at: '2026-07-06T00:00:00.000Z',
    };

    await expect(
      defaultAnchorSummaryPlugin.summarize(context),
    ).resolves.toEqual({ publicSummary: null });
    await expect(
      defaultMeetingMinutesPlugin.canonicalize({
        cooperative,
        sourceRecords: [],
      }),
    ).resolves.toEqual({ minutes: null });
    await expect(
      defaultPatronageAllocatorPlugin.allocate({
        cooperative,
        period: { id: 'fy-2026' },
        surplus: 100,
        metrics: [],
      }),
    ).resolves.toEqual({ allocations: [] });
    await expect(
      defaultSurplusDistributorPlugin.distribute({
        cooperative,
        period: { id: 'fy-2026' },
        allocations: [],
      }),
    ).resolves.toEqual({ distributions: [] });
  });

  it('records deterministic default snapshot ids and direct delegate chains', async () => {
    await expect(
      defaultHistoricalStatePlugin.readSnapshot({
        cooperative,
        at: '2026-07-06T00:00:00.000Z',
      }),
    ).resolves.toEqual({});
    await expect(
      defaultHistoricalStatePlugin.recordSnapshot({
        cooperative,
        at: '2026-07-06T00:00:00.000Z',
        members: [],
      }),
    ).resolves.toEqual({
      snapshotId:
        'default:did%3Aplc%3Acoop:members:network.coopsource.org.spaceType.members:2026-07-06T00%3A00%3A00.000Z',
    });
    await expect(
      defaultDelegateChainsPlugin.resolve({
        voter,
        proposal,
        cooperative,
        at: '2026-07-06T00:00:00.000Z',
      }),
    ).resolves.toEqual({
      chain: [voter],
      terminal: voter,
    });
  });

  it('allows callers to override individual default plugins', async () => {
    const plugins = createDefaultGovernancePluginSet({
      voteWeight: {
        async weightForVote() {
          return { weight: 3 };
        },
      },
    });

    await expect(
      plugins.voteWeight.weightForVote({
        voter,
        proposal,
        cooperative,
        voteChoice: 'yes',
        at: '2026-07-06T00:00:00.000Z',
      }),
    ).resolves.toEqual({ weight: 3 });
    await expect(
      plugins.eligibility.canVote({
        voter,
        proposal,
        cooperative,
        at: '2026-07-06T00:00:00.000Z',
      }),
    ).resolves.toEqual({ eligible: true });
  });
});
