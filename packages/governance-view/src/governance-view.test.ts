import { describe, expect, it } from 'vitest';
import {
  GovernanceView,
  createDefaultGovernancePluginSet,
} from './index.js';

describe('GovernanceView', () => {
  it('exposes its plugin set and generic tally/outcome behavior', () => {
    const plugins = createDefaultGovernancePluginSet();
    const view = new GovernanceView(plugins);

    const tally = view.reduceVoteTally([
      { choice: 'yes', weight: 2 },
      { choice: 'no', weight: 1 },
    ]);

    expect(view.plugins).toBe(plugins);
    expect(tally).toEqual({
      tally: { yes: 1, no: 1 },
      weightedTally: { yes: 2, no: 1 },
    });
    expect(
      view.decideProposalOutcome({
        votingType: 'binary',
        weightedTally: tally.weightedTally,
        quorum: { met: true, outcomeReason: 'met' },
      }),
    ).toBe('passed');
  });
});
