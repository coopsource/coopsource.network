import type { DelegateChainsPlugin } from '@coopsource/governance-view';
import type { CoopDelegateChainReader } from './ports.js';

export interface CoopDelegateChainsPluginOptions {
  readonly chainReader: CoopDelegateChainReader;
}

export class CoopDelegateChainsPlugin implements DelegateChainsPlugin {
  constructor(private readonly options: CoopDelegateChainsPluginOptions) {}

  async resolve(
    input: Parameters<DelegateChainsPlugin['resolve']>[0],
  ): ReturnType<DelegateChainsPlugin['resolve']> {
    const links = await this.options.chainReader.resolveDelegateChain({
      cooperativeDid: input.cooperative.authorityDid,
      voterDid: input.voter.did,
      proposalUri: input.proposal.uri,
    });

    const chain = [input.voter];
    let expectedDelegatorDid = input.voter.did;
    for (const link of links) {
      if (link.delegatorDid !== expectedDelegatorDid) {
        throw new Error(
          `Non-contiguous delegation chain for ${input.voter.did}: expected ${expectedDelegatorDid}, got ${link.delegatorDid}`,
        );
      }
      chain.push({ did: link.delegateeDid });
      expectedDelegatorDid = link.delegateeDid;
    }

    return {
      chain,
      terminal: chain[chain.length - 1]!,
    };
  }
}

export function createCoopDelegateChainsPlugin(
  chainReader: CoopDelegateChainReader,
): DelegateChainsPlugin {
  return new CoopDelegateChainsPlugin({ chainReader });
}
