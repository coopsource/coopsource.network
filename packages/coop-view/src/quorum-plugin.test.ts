import { describe, expect, it } from 'vitest';
import {
  CoopQuorumPlugin,
  createCoopQuorumPlugin,
} from './index.js';
import type { GovernanceTallyInput } from '@coopsource/governance-view';

const baseInput: GovernanceTallyInput = {
  proposal: {
    uri: 'at://did:plc:coop/network.coopsource.governance.proposal/abc',
    collection: 'network.coopsource.governance.proposal',
  },
  cooperative: {
    authorityDid: 'did:plc:coop',
    spaceKey: 'members',
    spaceType: 'network.coopsource.org.spaceType.members',
  },
  eligibleVoterCount: 3,
  votes: [
    {
      voter: { did: 'did:plc:alice' },
      choice: 'yes',
      weight: 2,
      memberClass: 'worker',
    },
    {
      voter: { did: 'did:plc:bob' },
      choice: 'yes',
      weight: 1,
      memberClass: 'worker',
    },
  ],
  quorum: { type: 'simpleMajority', threshold: 0.5 },
};

describe('CoopQuorumPlugin', () => {
  it('evaluates headcount quorum', async () => {
    const plugin = createCoopQuorumPlugin();

    await expect(plugin.evaluate(baseInput)).resolves.toEqual({
      met: true,
      outcomeReason: 'met',
    });
    await expect(
      plugin.evaluate({
        ...baseInput,
        votes: [baseInput.votes[0]!],
      }),
    ).resolves.toEqual({
      met: false,
      outcomeReason: 'no_quorum',
    });
  });

  it('applies supermajority, unanimous, and custom thresholds', async () => {
    const plugin = createCoopQuorumPlugin();

    await expect(
      plugin.evaluate({
        ...baseInput,
        eligibleVoterCount: 3,
        quorum: { type: 'superMajority' },
      }),
    ).resolves.toEqual({
      met: true,
      outcomeReason: 'met',
    });
    await expect(
      plugin.evaluate({
        ...baseInput,
        quorum: { type: 'unanimous' },
      }),
    ).resolves.toEqual({
      met: false,
      outcomeReason: 'no_quorum',
    });
    await expect(
      plugin.evaluate({
        ...baseInput,
        eligibleVoterCount: 4,
        quorum: { type: 'custom', threshold: 0.75 },
      }),
    ).resolves.toEqual({
      met: false,
      outcomeReason: 'no_quorum',
    });
    await expect(
      plugin.evaluate({
        ...baseInput,
        eligibleVoterCount: 4,
        votes: [
          ...baseInput.votes,
          {
            voter: { did: 'did:plc:carol' },
            choice: 'yes',
            weight: 1,
          },
        ],
        quorum: { type: 'custom', threshold: 0.75 },
      }),
    ).resolves.toEqual({
      met: true,
      outcomeReason: 'met',
    });
  });

  it('evaluates class minimum vote rules after headcount quorum passes', async () => {
    const plugin = createCoopQuorumPlugin();

    await expect(
      plugin.evaluate({
        ...baseInput,
        classQuorumRules: {
          worker: { minVotes: 3 },
        },
      }),
    ).resolves.toEqual({
      met: false,
      outcomeReason: 'class_quorum_not_met',
    });
  });

  it('evaluates class minimum weight ratio rules', async () => {
    const plugin = createCoopQuorumPlugin();

    await expect(
      plugin.evaluate({
        ...baseInput,
        classDenominators: [{ className: 'worker', totalWeight: 6 }],
        classQuorumRules: {
          worker: { minWeightRatio: 0.5 },
        },
      }),
    ).resolves.toEqual({
      met: true,
      outcomeReason: 'met',
    });

    await expect(
      plugin.evaluate({
        ...baseInput,
        classDenominators: [{ className: 'worker', totalWeight: 7 }],
        classQuorumRules: {
          worker: { minWeightRatio: 0.5 },
        },
      }),
    ).resolves.toEqual({
      met: false,
      outcomeReason: 'class_quorum_not_met',
    });
  });

  it('reports headcount failure before class quorum failure', async () => {
    const plugin = createCoopQuorumPlugin();

    await expect(
      plugin.evaluate({
        ...baseInput,
        votes: [baseInput.votes[0]!],
        classQuorumRules: {
          worker: { minVotes: 2 },
        },
      }),
    ).resolves.toEqual({
      met: false,
      outcomeReason: 'no_quorum',
    });
  });

  it('can include internal evidence for adapter tracing', async () => {
    const plugin = new CoopQuorumPlugin({ includeEvidence: true });

    await expect(
      plugin.evaluate({
        ...baseInput,
        classDenominators: [{ className: 'worker', totalWeight: 7 }],
        classQuorumRules: {
          worker: { minWeightRatio: 0.5 },
        },
      }),
    ).resolves.toEqual({
      met: false,
      outcomeReason: 'class_quorum_not_met',
      evidence: {
        source: 'coop-quorum-rules',
        voteCount: 2,
        eligibleVoterCount: 3,
        threshold: 0.5,
        classChecks: [
          {
            className: 'worker',
            voteCount: 2,
            voteWeight: 3,
            totalWeight: 7,
            met: false,
            reason: 'min_weight_ratio',
          },
        ],
      },
    });
  });
});
