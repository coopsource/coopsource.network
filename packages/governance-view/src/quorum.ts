import type { GovernanceQuorumConfig } from './types.js';

export interface GovernanceHeadcountQuorumResult {
  readonly met: boolean;
  readonly threshold?: number;
}

export function evaluateGovernanceHeadcountQuorum(
  config: GovernanceQuorumConfig | undefined,
  voteCount: number,
  eligibleVoterCount: number,
): GovernanceHeadcountQuorumResult {
  if (!config || config.type === undefined || config.type === 'none') {
    return { met: true };
  }

  const threshold = effectiveQuorumThreshold(config);
  if (
    threshold === undefined ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 1 ||
    eligibleVoterCount <= 0
  ) {
    return { met: false };
  }

  const requiredVotes = eligibleVoterCount * threshold;
  const comparison =
    config.comparison ??
    (config.type === 'simpleMajority' ? 'greaterThan' : 'atLeast');
  return {
    met:
      comparison === 'greaterThan'
        ? voteCount > requiredVotes
        : voteCount >= requiredVotes,
    threshold,
  };
}

function effectiveQuorumThreshold(
  config: GovernanceQuorumConfig,
): number | undefined {
  switch (config.type) {
    case 'simpleMajority':
      return config.threshold ?? 0.5;
    case 'superMajority':
      return config.threshold ?? 2 / 3;
    case 'unanimous':
      return 1;
    case 'custom':
      return config.threshold;
    default:
      return undefined;
  }
}
