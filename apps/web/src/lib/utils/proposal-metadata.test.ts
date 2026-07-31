import { describe, expect, it } from 'vitest';
import {
  proposalQuorumLabel,
  proposalQuorumTypeLabel,
  proposalVotingTypeLabel,
} from './proposal-metadata.js';

describe('proposal metadata labels', () => {
  it('labels every supported voting type', () => {
    expect(proposalVotingTypeLabel('binary')).toBe('Yes / no');
    expect(proposalVotingTypeLabel('approval')).toBe('Approval');
    expect(proposalVotingTypeLabel('ranked')).toBe('Ranked choice');
  });

  it('labels every supported quorum type', () => {
    expect(proposalQuorumTypeLabel('simpleMajority')).toBe('Simple majority');
    expect(proposalQuorumTypeLabel('superMajority')).toBe('Supermajority');
    expect(proposalQuorumTypeLabel('unanimous')).toBe('Unanimous');
    expect(proposalQuorumTypeLabel('custom')).toBe('Custom threshold');
  });

  it('renders effective and custom quorum thresholds', () => {
    expect(proposalQuorumLabel('simpleMajority', null)).toBe(
      'Simple majority (>50%)',
    );
    expect(proposalQuorumLabel('superMajority', null)).toBe(
      'Supermajority (66.7%)',
    );
    expect(proposalQuorumLabel('unanimous', null)).toBe('Unanimous (100%)');
    expect(proposalQuorumLabel('custom', 0.75)).toBe('Custom threshold (75%)');
    expect(proposalQuorumLabel('custom', null)).toBe(
      'Custom threshold (missing)',
    );
  });
});
