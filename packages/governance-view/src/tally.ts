import type {
  GovernanceProposalOutcomeInput,
  GovernanceVoteChoiceForTally,
  GovernanceVoteTally,
} from './types.js';

export function reduceGovernanceVoteTally(
  votes: ReadonlyArray<GovernanceVoteChoiceForTally>,
): GovernanceVoteTally {
  const tally: Record<string, number> = {};
  const weightedTally: Record<string, number> = {};

  for (const vote of votes) {
    tally[vote.choice] = (tally[vote.choice] ?? 0) + 1;
    weightedTally[vote.choice] =
      (weightedTally[vote.choice] ?? 0) + (vote.weight ?? 1);
  }

  return { tally, weightedTally };
}

export function decideGovernanceProposalOutcome(
  input: GovernanceProposalOutcomeInput,
): string {
  if (!input.quorum.met) {
    return input.quorum.outcomeReason === 'class_quorum_not_met'
      ? 'class_quorum_not_met'
      : 'no_quorum';
  }

  if (input.votingType === 'binary') {
    const yes = input.weightedTally['yes'] ?? 0;
    const no = input.weightedTally['no'] ?? 0;
    return yes > no ? 'passed' : 'failed';
  }

  const sorted = Object.entries(input.weightedTally).sort(
    (a, b) => b[1] - a[1],
  );
  return sorted.length > 0 ? 'passed' : 'no_quorum';
}
