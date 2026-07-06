import { describe, expect, it } from 'vitest';
import {
  CoopDelegateChainsPlugin,
  createCoopDelegateChainsPlugin,
  type CoopDelegateChainReader,
} from './index.js';

const input = {
  voter: { did: 'did:plc:alice' },
  proposal: {
    uri: 'at://did:plc:coop/network.coopsource.governance.proposal/abc',
    collection: 'network.coopsource.governance.proposal',
  },
  cooperative: {
    authorityDid: 'did:plc:coop',
    spaceKey: 'members',
    spaceType: 'network.coopsource.org.spaceType.members',
  },
  at: '2026-07-06T12:00:00.000Z',
};

describe('CoopDelegateChainsPlugin', () => {
  it('delegates chain resolution to the cooperative reader', async () => {
    const events: string[] = [];
    const reader: CoopDelegateChainReader = {
      async resolveDelegateChain(args) {
        events.push(
          `reader-start:${args.cooperativeDid}:${args.voterDid}:${args.proposalUri}`,
        );
        await Promise.resolve();
        events.push('reader-finish');
        return [
          {
            delegatorDid: 'did:plc:alice',
            delegateeDid: 'did:plc:bob',
          },
          {
            delegatorDid: 'did:plc:bob',
            delegateeDid: 'did:plc:carol',
          },
        ];
      },
    };
    const plugin = createCoopDelegateChainsPlugin(reader);

    events.push('call-start');
    const result = await plugin.resolve(input);
    events.push('call-finish');

    expect(result).toEqual({
      chain: [
        { did: 'did:plc:alice' },
        { did: 'did:plc:bob' },
        { did: 'did:plc:carol' },
      ],
      terminal: { did: 'did:plc:carol' },
    });
    expect(events).toEqual([
      'call-start',
      'reader-start:did:plc:coop:did:plc:alice:at://did:plc:coop/network.coopsource.governance.proposal/abc',
      'reader-finish',
      'call-finish',
    ]);
  });

  it('returns the voter as terminal when there is no delegation chain', async () => {
    const plugin = createCoopDelegateChainsPlugin({
      async resolveDelegateChain() {
        return [];
      },
    });

    await expect(plugin.resolve(input)).resolves.toEqual({
      chain: [{ did: 'did:plc:alice' }],
      terminal: { did: 'did:plc:alice' },
    });
  });

  it('rejects non-contiguous delegation chains', async () => {
    const plugin = new CoopDelegateChainsPlugin({
      chainReader: {
        async resolveDelegateChain() {
          return [
            {
              delegatorDid: 'did:plc:someone-else',
              delegateeDid: 'did:plc:bob',
            },
          ];
        },
      },
    });

    await expect(plugin.resolve(input)).rejects.toThrow(
      'Non-contiguous delegation chain',
    );
  });
});
