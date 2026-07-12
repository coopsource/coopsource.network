import { describe, expect, it } from 'vitest';
import {
  decideGovernanceProposalOutcome,
  reduceGovernanceVoteTally,
} from './index.js';

describe('governance vote tally reducers', () => {
  it('counts votes by choice and sums defaulted weights by choice', () => {
    expect(
      reduceGovernanceVoteTally([
        { choice: 'yes', weight: 2 },
        { choice: 'yes' },
        { choice: 'no', weight: 0.5 },
      ]),
    ).toEqual({
      tally: { yes: 2, no: 1 },
      weightedTally: { yes: 3, no: 0.5 },
    });
  });

  it('keeps the unweighted tally independent of vote weight', () => {
    expect(
      reduceGovernanceVoteTally([
        { choice: 'option-a', weight: 100 },
        { choice: 'option-b', weight: 0 },
        { choice: 'option-a', weight: 0.25 },
      ]).tally,
    ).toEqual({ 'option-a': 2, 'option-b': 1 });
  });

  it('maps quorum failures to the existing unresolved outcomes', () => {
    expect(
      decideGovernanceProposalOutcome({
        votingType: 'binary',
        weightedTally: { yes: 3 },
        quorum: { met: false, outcomeReason: 'class_quorum_not_met' },
      }),
    ).toBe('class_quorum_not_met');

    expect(
      decideGovernanceProposalOutcome({
        votingType: 'binary',
        weightedTally: { yes: 3 },
        quorum: { met: false, outcomeReason: 'no_quorum' },
      }),
    ).toBe('no_quorum');
  });

  it('uses weighted yes/no totals for binary proposal outcomes', () => {
    expect(
      decideGovernanceProposalOutcome({
        votingType: 'binary',
        weightedTally: { yes: 2, no: 1 },
        quorum: { met: true, outcomeReason: 'met' },
      }),
    ).toBe('passed');

    expect(
      decideGovernanceProposalOutcome({
        votingType: 'binary',
        weightedTally: { yes: 1, no: 1 },
        quorum: { met: true, outcomeReason: 'met' },
      }),
    ).toBe('failed');
  });

  it('preserves non-binary pass/no-quorum behavior from the API service', () => {
    expect(
      decideGovernanceProposalOutcome({
        votingType: 'ranked',
        weightedTally: { optionA: 2, optionB: 4 },
        quorum: { met: true, outcomeReason: 'met' },
      }),
    ).toBe('passed');

    expect(
      decideGovernanceProposalOutcome({
        votingType: 'ranked',
        weightedTally: {},
        quorum: { met: true, outcomeReason: 'met' },
      }),
    ).toBe('no_quorum');
  });
});
