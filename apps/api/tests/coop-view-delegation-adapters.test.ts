import { describe, expect, it } from 'vitest';
import { DelegationVotingServiceDelegateChainReader } from '../src/services/coop-view-delegation-adapters.js';

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
