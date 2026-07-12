import { describe, expect, it } from 'vitest';
import {
  evaluateGovernanceProposalAction,
  planGovernanceProposalExpiry,
} from './index.js';

describe('governance proposal lifecycle', () => {
  it.each([
    ['edit', 'draft'],
    ['open', 'draft'],
    ['close', 'open'],
    ['vote', 'open'],
    ['resolve', 'closed'],
  ] as const)('allows %s only from %s', (action, requiredStatus) => {
    expect(evaluateGovernanceProposalAction(requiredStatus, action)).toEqual({
      allowed: true,
    });
    expect(evaluateGovernanceProposalAction('resolved', action)).toEqual({
      allowed: false,
      currentStatus: 'resolved',
      requiredStatus,
    });
  });

  it('plans close then resolve for open expiry and retries closed resolution', () => {
    expect(planGovernanceProposalExpiry('open')).toEqual(['close', 'resolve']);
    expect(planGovernanceProposalExpiry('closed')).toEqual(['resolve']);
    expect(planGovernanceProposalExpiry('resolved')).toEqual([]);
  });
});
