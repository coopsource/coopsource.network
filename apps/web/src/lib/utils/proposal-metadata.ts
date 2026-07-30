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
