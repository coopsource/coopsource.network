import { describe, expect, it } from 'vitest';
import {
  DelegationVotingServiceDelegateChainReader,
  DelegationVotingServiceVoteWeightDelegationReader,
} from '../src/services/coop-view-delegation-adapters.js';

describe('DelegationVotingServiceVoteWeightDelegationReader', () => {
  it('adapts active delegation rows for CoopView vote-weight expansion', async () => {
    const events: string[] = [];
    const reader = new DelegationVotingServiceVoteWeightDelegationReader({
      async listActiveDelegationsForVoteWeight(cooperativeDid) {
        events.push(`reader-start:${cooperativeDid}`);
        await Promise.resolve();
        events.push('reader-finish');
        return [
          {
            delegator_did: 'did:plc:alice',
            delegatee_did: 'did:plc:bob',
            scope: 'project',
            proposal_uri: null,
          },
          {
            delegator_did: 'did:plc:carol',
            delegatee_did: 'did:plc:dora',
            scope: 'proposal',
            proposal_uri:
              'at://did:plc:coop/network.coopsource.governance.proposal/abc',
          },
        ];
      },
    });

    events.push('call-start');
    const delegations = await reader.listActiveDelegationsForVoteWeight({
      cooperativeDid: 'did:plc:coop',
      proposalUri:
        'at://did:plc:coop/network.coopsource.governance.proposal/abc',
      at: '2026-07-06T12:00:00.000Z',
    });
    events.push('call-finish');

    expect(delegations).toEqual([
      {
        delegatorDid: 'did:plc:alice',
        delegateeDid: 'did:plc:bob',
        scope: 'project',
        proposalUri: null,
      },
      {
        delegatorDid: 'did:plc:carol',
        delegateeDid: 'did:plc:dora',
        scope: 'proposal',
        proposalUri:
          'at://did:plc:coop/network.coopsource.governance.proposal/abc',
      },
    ]);
    expect(events).toEqual([
      'call-start',
      'reader-start:did:plc:coop',
      'reader-finish',
      'call-finish',
    ]);
  });

  it('propagates active delegation reader failures', async () => {
    const reader = new DelegationVotingServiceVoteWeightDelegationReader({
      async listActiveDelegationsForVoteWeight() {
        await Promise.resolve();
        throw new Error('Active delegation query failed');
      },
    });

    await expect(
      reader.listActiveDelegationsForVoteWeight({
        cooperativeDid: 'did:plc:coop',
        proposalUri:
          'at://did:plc:coop/network.coopsource.governance.proposal/abc',
        at: '2026-07-06T12:00:00.000Z',
      }),
    ).rejects.toThrow('Active delegation query failed');
  });

  it('fails closed on unsupported active delegation scopes', async () => {
    const reader = new DelegationVotingServiceVoteWeightDelegationReader({
      async listActiveDelegationsForVoteWeight() {
        return [
          {
            delegator_did: 'did:plc:alice',
            delegatee_did: 'did:plc:bob',
            scope: 'future-scope',
            proposal_uri: null,
          },
        ];
      },
    });

    await expect(
      reader.listActiveDelegationsForVoteWeight({
        cooperativeDid: 'did:plc:coop',
        proposalUri:
          'at://did:plc:coop/network.coopsource.governance.proposal/abc',
        at: '2026-07-06T12:00:00.000Z',
      }),
    ).rejects.toThrow('Unsupported active delegation scope');
  });
});

describe('DelegationVotingServiceDelegateChainReader', () => {
  it('uses proposal-scoped chains when they exist', async () => {
    const events: string[] = [];
    const reader = new DelegationVotingServiceDelegateChainReader({
      async getDelegationChain(
        cooperativeDid,
        memberDid,
        scope,
        proposalUri,
      ) {
        events.push(
          `reader:${cooperativeDid}:${memberDid}:${scope}:${proposalUri ?? ''}`,
        );
        await Promise.resolve();
        return [
          {
            delegator_did: 'did:plc:alice',
            delegatee_did: 'did:plc:bob',
          },
        ];
      },
    });

    const chain = await reader.resolveDelegateChain({
      cooperativeDid: 'did:plc:coop',
      voterDid: 'did:plc:alice',
      proposalUri:
        'at://did:plc:coop/network.coopsource.governance.proposal/abc',
    });

    expect(chain).toEqual([
      {
        delegatorDid: 'did:plc:alice',
        delegateeDid: 'did:plc:bob',
      },
    ]);
    expect(events).toEqual([
      'reader:did:plc:coop:did:plc:alice:proposal:at://did:plc:coop/network.coopsource.governance.proposal/abc',
    ]);
  });

  it('falls back to project-scoped chains when proposal scope is empty', async () => {
    const events: string[] = [];
    const reader = new DelegationVotingServiceDelegateChainReader({
      async getDelegationChain(
        cooperativeDid,
        memberDid,
        scope,
        proposalUri,
      ) {
        events.push(
          `reader:${cooperativeDid}:${memberDid}:${scope}:${proposalUri ?? ''}`,
        );
        await Promise.resolve();
        if (scope === 'proposal') return [];
        return [
          {
            delegator_did: 'did:plc:alice',
            delegatee_did: 'did:plc:carol',
          },
        ];
      },
    });

    const chain = await reader.resolveDelegateChain({
      cooperativeDid: 'did:plc:coop',
      voterDid: 'did:plc:alice',
      proposalUri:
        'at://did:plc:coop/network.coopsource.governance.proposal/abc',
    });

    expect(chain).toEqual([
      {
        delegatorDid: 'did:plc:alice',
        delegateeDid: 'did:plc:carol',
      },
    ]);
    expect(events).toEqual([
      'reader:did:plc:coop:did:plc:alice:proposal:at://did:plc:coop/network.coopsource.governance.proposal/abc',
      'reader:did:plc:coop:did:plc:alice:project:',
    ]);
  });

  it('propagates delegation service failures', async () => {
    const reader = new DelegationVotingServiceDelegateChainReader({
      async getDelegationChain() {
        await Promise.resolve();
        throw new Error('Delegation query failed');
      },
    });

    await expect(
      reader.resolveDelegateChain({
        cooperativeDid: 'did:plc:coop',
        voterDid: 'did:plc:alice',
        proposalUri:
          'at://did:plc:coop/network.coopsource.governance.proposal/abc',
      }),
    ).rejects.toThrow('Delegation query failed');
  });
});
