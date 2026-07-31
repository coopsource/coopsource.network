import type {
  ActionAuthorizerPlugin,
  AnchorSummaryPlugin,
  DelegateChainsPlugin,
  EligibilityPlugin,
  GovernancePluginSet,
  HistoricalStatePlugin,
  MeetingMinutesPlugin,
  PatronageAllocatorPlugin,
  QuorumPlugin,
  SurplusDistributorPlugin,
  VoteWeightPlugin,
} from './plugins.js';
import type { GovernanceGroupRef } from './types.js';
import { evaluateGovernanceHeadcountQuorum } from './quorum.js';

export const defaultVoteWeightPlugin: VoteWeightPlugin = {
  async weightForVote() {
    return { weight: 1 };
  },
};

export const defaultEligibilityPlugin: EligibilityPlugin = {
  async canVote() {
    return { eligible: true };
  },
};

export const defaultQuorumPlugin: QuorumPlugin = {
  async evaluate(input) {
    const { met } = evaluateGovernanceHeadcountQuorum(
      input.quorum,
      input.votes.length,
      input.eligibleVoterCount,
    );
    return {
      met,
      outcomeReason: met ? 'met' : 'no_quorum',
    };
  },
};

export const defaultActionAuthorizerPlugin: ActionAuthorizerPlugin = {
  async authorize() {
    return { authorized: true };
  },
};

export const defaultAnchorSummaryPlugin: AnchorSummaryPlugin = {
  async summarize() {
    return { publicSummary: null };
  },
};

export const defaultHistoricalStatePlugin: HistoricalStatePlugin = {
  async readSnapshot() {
    return {};
  },

  async recordSnapshot(input) {
    return {
      snapshotId: defaultSnapshotId(input.cooperative, input.at),
    };
  },
};

export const defaultPatronageAllocatorPlugin: PatronageAllocatorPlugin = {
  async allocate() {
    return { allocations: [] };
  },
};

export const defaultSurplusDistributorPlugin: SurplusDistributorPlugin = {
  async distribute() {
    return { distributions: [] };
  },
};

export const defaultMeetingMinutesPlugin: MeetingMinutesPlugin = {
  async canonicalize() {
    return { minutes: null };
  },
};

export const defaultDelegateChainsPlugin: DelegateChainsPlugin = {
  async resolve(input) {
    return {
      chain: [input.voter],
      terminal: input.voter,
    };
  },
};

export const DEFAULT_GOVERNANCE_PLUGINS: GovernancePluginSet = Object.freeze({
  voteWeight: defaultVoteWeightPlugin,
  eligibility: defaultEligibilityPlugin,
  quorum: defaultQuorumPlugin,
  actionAuthorizer: defaultActionAuthorizerPlugin,
  anchorSummary: defaultAnchorSummaryPlugin,
  historicalState: defaultHistoricalStatePlugin,
  patronageAllocator: defaultPatronageAllocatorPlugin,
  surplusDistributor: defaultSurplusDistributorPlugin,
  meetingMinutes: defaultMeetingMinutesPlugin,
  delegateChains: defaultDelegateChainsPlugin,
});

export function createDefaultGovernancePluginSet(
  overrides: Partial<GovernancePluginSet> = {},
): GovernancePluginSet {
  return {
    ...DEFAULT_GOVERNANCE_PLUGINS,
    ...overrides,
  };
}

function defaultSnapshotId(
  cooperative: GovernanceGroupRef,
  at: string,
): string {
  return [
    'default',
    encodeURIComponent(cooperative.authorityDid),
    encodeURIComponent(cooperative.spaceKey),
    encodeURIComponent(cooperative.spaceType ?? ''),
    encodeURIComponent(at),
  ].join(':');
}
