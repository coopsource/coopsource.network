import { describe, expect, it } from 'vitest';
import {
  CoopDelegatedVoteWeightReader,
  type CoopBaseVoteWeightReader,
  type CoopVoteWeightDelegationReader,
} from './index.js';

const input = {
  cooperativeDid: 'did:plc:coop',
  memberDid: 'did:plc:alice',
  proposalUri: 'at://did:plc:coop/network.coopsource.governance.proposal/abc',
  voteChoice: 'yes',
  at: '2026-07-06T12:00:00.000Z',
};

function baseWeights(
  weights: Readonly<Record<string, number>>,
  events: string[] = [],
): CoopBaseVoteWeightReader {
  return {
    async getBaseMemberVoteWeight(args) {
      events.push(`base:${args.memberDid}:${args.at}`);
      await Promise.resolve();
      return weights[args.memberDid] ?? 1;
    },
  };
}

describe('CoopDelegatedVoteWeightReader', () => {
  it('adds direct and transitive delegator base weights', async () => {
    const events: string[] = [];
    const delegationReader: CoopVoteWeightDelegationReader = {
      async listActiveDelegationsForVoteWeight(args) {
        events.push(
          `delegations:${args.cooperativeDid}:${args.proposalUri}:${args.at}`,
        );
        await Promise.resolve();
        return [
          {
            delegatorDid: 'did:plc:bob',
            delegateeDid: 'did:plc:alice',
            scope: 'project',
          },
          {
            delegatorDid: 'did:plc:carol',
            delegateeDid: 'did:plc:bob',
            scope: 'project',
          },
        ];
      },
    };
    const reader = new CoopDelegatedVoteWeightReader({
      baseWeightReader: baseWeights(
        {
          'did:plc:alice': 2,
          'did:plc:bob': 3,
          'did:plc:carol': 5,
        },
        events,
      ),
      delegationReader,
    });

    events.push('call:start');
    const weight = await reader.getProjectedMemberVoteWeight(input);
    events.push('call:finish');

    expect(weight).toBe(10);
    expect(events).toEqual([
      'call:start',
      'delegations:did:plc:coop:at://did:plc:coop/network.coopsource.governance.proposal/abc:2026-07-06T12:00:00.000Z',
      'base:did:plc:alice:2026-07-06T12:00:00.000Z',
      'base:did:plc:bob:2026-07-06T12:00:00.000Z',
      'base:did:plc:carol:2026-07-06T12:00:00.000Z',
      'call:finish',
    ]);
  });

  it('lets matching proposal-scoped delegations override project delegation', async () => {
    const delegationReader: CoopVoteWeightDelegationReader = {
      async listActiveDelegationsForVoteWeight() {
        return [
          {
            delegatorDid: 'did:plc:bob',
            delegateeDid: 'did:plc:alice',
            scope: 'project',
          },
          {
            delegatorDid: 'did:plc:bob',
            delegateeDid: 'did:plc:carol',
            scope: 'proposal',
            proposalUri: input.proposalUri,
          },
        ];
      },
    };
    const reader = new CoopDelegatedVoteWeightReader({
      baseWeightReader: baseWeights({
        'did:plc:alice': 1,
        'did:plc:bob': 4,
        'did:plc:carol': 2,
      }),
      delegationReader,
    });

    await expect(reader.getProjectedMemberVoteWeight(input)).resolves.toBe(1);
    await expect(
      reader.getProjectedMemberVoteWeight({
        ...input,
        memberDid: 'did:plc:carol',
      }),
    ).resolves.toBe(6);
  });

  it('ignores proposal-scoped delegations for other proposals', async () => {
    const reader = new CoopDelegatedVoteWeightReader({
      baseWeightReader: baseWeights({
        'did:plc:alice': 1,
        'did:plc:bob': 4,
      }),
      delegationReader: {
        async listActiveDelegationsForVoteWeight() {
          return [
            {
              delegatorDid: 'did:plc:bob',
              delegateeDid: 'did:plc:alice',
              scope: 'project',
            },
            {
              delegatorDid: 'did:plc:bob',
              delegateeDid: 'did:plc:carol',
              scope: 'proposal',
              proposalUri:
                'at://did:plc:coop/network.coopsource.governance.proposal/other',
            },
          ];
        },
      },
    });

    await expect(reader.getProjectedMemberVoteWeight(input)).resolves.toBe(5);
  });

  it('breaks corrupt cycles instead of treating them as terminal delegation', async () => {
    const reader = new CoopDelegatedVoteWeightReader({
      baseWeightReader: baseWeights({
        'did:plc:alice': 1,
        'did:plc:bob': 3,
        'did:plc:carol': 5,
      }),
      delegationReader: {
        async listActiveDelegationsForVoteWeight() {
          return [
            {
              delegatorDid: 'did:plc:bob',
              delegateeDid: 'did:plc:carol',
              scope: 'project',
            },
            {
              delegatorDid: 'did:plc:carol',
              delegateeDid: 'did:plc:bob',
              scope: 'project',
            },
          ];
        },
      },
    });

    await expect(reader.getProjectedMemberVoteWeight(input)).resolves.toBe(1);
  });

  it('propagates delegation-reader failures', async () => {
    const reader = new CoopDelegatedVoteWeightReader({
      baseWeightReader: baseWeights({}),
      delegationReader: {
        async listActiveDelegationsForVoteWeight() {
          await Promise.resolve();
          throw new Error('delegation read failed');
        },
      },
    });

    await expect(reader.getProjectedMemberVoteWeight(input)).rejects.toThrow(
      'delegation read failed',
    );
  });

  it('rejects invalid base member weights', async () => {
    const reader = new CoopDelegatedVoteWeightReader({
      baseWeightReader: baseWeights({ 'did:plc:alice': Number.NaN }),
      delegationReader: {
        async listActiveDelegationsForVoteWeight() {
          return [];
        },
      },
    });

    await expect(reader.getProjectedMemberVoteWeight(input)).rejects.toThrow(
      'Invalid base vote weight',
    );
  });
});
