import { describe, expect, it } from 'vitest';
import {
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
});
