import type { CoopDelegateChainReader } from '@coopsource/coop-view';
import type { DelegationVotingService } from './delegation-voting-service.js';

export class DelegationVotingServiceDelegateChainReader
  implements CoopDelegateChainReader
{
  constructor(
    private readonly delegationVotingService: Pick<
      DelegationVotingService,
      'getDelegationChain'
    >,
  ) {}

  async resolveDelegateChain(input: {
    readonly cooperativeDid: string;
    readonly voterDid: string;
    readonly proposalUri: string;
  }): ReturnType<CoopDelegateChainReader['resolveDelegateChain']> {
    const proposalChain =
      await this.delegationVotingService.getDelegationChain(
        input.cooperativeDid,
        input.voterDid,
        'proposal',
        input.proposalUri,
      );
    const chain =
      proposalChain.length > 0
        ? proposalChain
        : await this.delegationVotingService.getDelegationChain(
            input.cooperativeDid,
            input.voterDid,
            'project',
          );

    return chain.map((link) => ({
      delegatorDid: link.delegator_did,
      delegateeDid: link.delegatee_did,
    }));
  }
}
