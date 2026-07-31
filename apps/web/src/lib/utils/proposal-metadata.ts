import type {
  ProposalQuorumType,
  ProposalVotingType,
} from '@coopsource/common';

const votingTypeLabels = {
  binary: 'Yes / no',
  approval: 'Approval',
  ranked: 'Ranked choice',
} satisfies Record<ProposalVotingType, string>;

const quorumTypeLabels = {
  simpleMajority: 'Simple majority',
  superMajority: 'Supermajority',
  unanimous: 'Unanimous',
  custom: 'Custom threshold',
} satisfies Record<ProposalQuorumType, string>;

export function proposalVotingTypeLabel(
  votingType: ProposalVotingType,
): string {
  return votingTypeLabels[votingType];
}

export function proposalQuorumTypeLabel(
  quorumType: ProposalQuorumType,
): string {
  return quorumTypeLabels[quorumType];
}

export function proposalQuorumLabel(
  quorumType: ProposalQuorumType,
  quorumThreshold: number | null,
): string {
  const threshold =
    quorumThreshold ??
    (quorumType === 'superMajority'
      ? 2 / 3
      : quorumType === 'unanimous'
        ? 1
        : quorumType === 'simpleMajority'
          ? 0.5
          : null);
  if (threshold === null) return `${quorumTypeLabels[quorumType]} (missing)`;

  const percentage = Math.round(threshold * 1_000) / 10;
  const operator = quorumType === 'simpleMajority' ? '>' : '';
  return `${quorumTypeLabels[quorumType]} (${operator}${percentage}%)`;
}
