import { describe, expect, it } from 'vitest';
import {
  effectiveCoopDelegationsForProposal,
  findCyclicCoopDelegators,
  validateCoopDelegationCommand,
  type CoopVoteWeightDelegation,
} from './index.js';

const proposalUri =
  'at://did:plc:coop/network.coopsource.governance.proposal/abc';

function delegation(
  fields: Partial<CoopVoteWeightDelegation> &
    Pick<CoopVoteWeightDelegation, 'delegatorDid' | 'delegateeDid'>,
): CoopVoteWeightDelegation {
  return {
    scope: 'project',
    ...fields,
  };
}

describe('Coop delegation command policy', () => {
  it('rejects self-delegation and invalid scope/proposal combinations', () => {
    expect(
      validateCoopDelegationCommand({
        activeDelegations: [],
        candidate: delegation({
          delegatorDid: 'did:plc:alice',
          delegateeDid: 'did:plc:alice',
        }),
      }),
    ).toEqual({
      allowed: false,
      reason: 'self_delegation',
      message: 'Cannot delegate to yourself',
    });

    expect(
      validateCoopDelegationCommand({
        activeDelegations: [],
        candidate: delegation({
          delegatorDid: 'did:plc:alice',
          delegateeDid: 'did:plc:bob',
          scope: 'proposal',
        }),
      }),
    ).toEqual({
      allowed: false,
      reason: 'proposal_uri_required',
      message: 'proposalUri is required for proposal scope',
    });

    expect(
      validateCoopDelegationCommand({
        activeDelegations: [],
        candidate: delegation({
          delegatorDid: 'did:plc:alice',
          delegateeDid: 'did:plc:bob',
          scope: 'project',
          proposalUri,
        }),
      }),
    ).toEqual({
      allowed: false,
      reason: 'proposal_uri_not_allowed',
      message: 'proposalUri is only valid for proposal scope',
    });
  });

  it('rejects direct project cycles', () => {
    expect(
      validateCoopDelegationCommand({
        activeDelegations: [
          delegation({
            delegatorDid: 'did:plc:bob',
            delegateeDid: 'did:plc:alice',
          }),
        ],
        candidate: delegation({
          delegatorDid: 'did:plc:alice',
          delegateeDid: 'did:plc:bob',
        }),
      }),
    ).toEqual({
      allowed: false,
      reason: 'circular_delegation',
      message: 'Circular delegation detected',
    });
  });

  it('rejects proposal candidates that create mixed project/proposal cycles', () => {
    expect(
      validateCoopDelegationCommand({
        activeDelegations: [
          delegation({
            delegatorDid: 'did:plc:bob',
            delegateeDid: 'did:plc:alice',
          }),
        ],
        candidate: delegation({
          delegatorDid: 'did:plc:alice',
          delegateeDid: 'did:plc:bob',
          scope: 'proposal',
          proposalUri,
        }),
      }),
    ).toEqual({
      allowed: false,
      reason: 'circular_delegation',
      message: 'Circular delegation detected',
    });
  });

  it('rejects project candidates that close an existing proposal-scoped cycle', () => {
    expect(
      validateCoopDelegationCommand({
        activeDelegations: [
          delegation({
            delegatorDid: 'did:plc:bob',
            delegateeDid: 'did:plc:alice',
            scope: 'proposal',
            proposalUri,
          }),
        ],
        candidate: delegation({
          delegatorDid: 'did:plc:alice',
          delegateeDid: 'did:plc:bob',
        }),
      }),
    ).toEqual({
      allowed: false,
      reason: 'circular_delegation',
      message: 'Circular delegation detected',
    });
  });

  it('evaluates replacement using the candidate instead of the old active row', () => {
    expect(
      validateCoopDelegationCommand({
        activeDelegations: [
          delegation({
            delegatorDid: 'did:plc:alice',
            delegateeDid: 'did:plc:bob',
          }),
          delegation({
            delegatorDid: 'did:plc:bob',
            delegateeDid: 'did:plc:alice',
          }),
        ],
        candidate: delegation({
          delegatorDid: 'did:plc:alice',
          delegateeDid: 'did:plc:carol',
        }),
      }),
    ).toEqual({ allowed: true });
  });

  it('uses proposal-scoped delegations over project fallback for the same proposal', () => {
    const effective = effectiveCoopDelegationsForProposal(
      [
        delegation({
          delegatorDid: 'did:plc:alice',
          delegateeDid: 'did:plc:bob',
        }),
        delegation({
          delegatorDid: 'did:plc:alice',
          delegateeDid: 'did:plc:carol',
          scope: 'proposal',
          proposalUri,
        }),
      ],
      proposalUri,
    );

    expect(effective.get('did:plc:alice')?.delegateeDid).toBe(
      'did:plc:carol',
    );
  });

  it('reports every member of a cyclic component', () => {
    const cycles = findCyclicCoopDelegators(
      effectiveCoopDelegationsForProposal(
        [
          delegation({
            delegatorDid: 'did:plc:alice',
            delegateeDid: 'did:plc:bob',
          }),
          delegation({
            delegatorDid: 'did:plc:bob',
            delegateeDid: 'did:plc:carol',
          }),
          delegation({
            delegatorDid: 'did:plc:carol',
            delegateeDid: 'did:plc:alice',
          }),
        ],
        null,
      ),
    );

    expect([...cycles].sort()).toEqual([
      'did:plc:alice',
      'did:plc:bob',
      'did:plc:carol',
    ]);
  });
});
