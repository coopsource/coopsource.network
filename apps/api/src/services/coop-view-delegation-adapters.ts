import type {
  CoopDelegateChainReader,
  CoopDelegationScope,
  CoopVoteWeightDelegation,
  CoopVoteWeightDelegationReader,
} from '@coopsource/coop-view';
import type { DelegationVotingService } from './delegation-voting-service.js';

export class DelegationVotingServiceVoteWeightDelegationReader
  implements CoopVoteWeightDelegationReader
{
  constructor(
    private readonly delegationVotingService: Pick<
      DelegationVotingService,
      'listActiveDelegationsForVoteWeight'
    >,
  ) {}

  async listActiveDelegationsForVoteWeight(input: {
    readonly cooperativeDid: string;
    readonly proposalUri: string;
    readonly at: string;
  }): Promise<readonly CoopVoteWeightDelegation[]> {
    const rows =
      await this.delegationVotingService.listActiveDelegationsForVoteWeight(
        input.cooperativeDid,
      );

    return rows.map((row) => ({
      delegatorDid: row.delegator_did,
      delegateeDid: row.delegatee_did,
      scope: delegationScope(row.scope),
      proposalUri: row.proposal_uri,
    }));
  }
}

function delegationScope(scope: string): CoopDelegationScope {
  if (scope === 'project' || scope === 'proposal') {
    return scope;
  }
  throw new Error(`Unsupported active delegation scope: ${scope}`);
}

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
