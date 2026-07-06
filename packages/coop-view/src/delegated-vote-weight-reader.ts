import type {
  CoopBaseVoteWeightReader,
  CoopVoteWeightDelegation,
  CoopVoteWeightDelegationReader,
  CoopVoteWeightReader,
} from './ports.js';
import {
  effectiveCoopDelegationsForProposal,
  findCyclicCoopDelegators,
} from './delegation-command-policy.js';

export interface CoopDelegatedVoteWeightReaderOptions {
  readonly baseWeightReader: CoopBaseVoteWeightReader;
  readonly delegationReader: CoopVoteWeightDelegationReader;
}

export class CoopDelegatedVoteWeightReader implements CoopVoteWeightReader {
  constructor(private readonly options: CoopDelegatedVoteWeightReaderOptions) {}

  async getProjectedMemberVoteWeight(input: {
    readonly cooperativeDid: string;
    readonly memberDid: string;
    readonly proposalUri: string;
    readonly voteChoice: string;
    readonly at: string;
  }): Promise<number> {
    const activeDelegations =
      await this.options.delegationReader.listActiveDelegationsForVoteWeight({
        cooperativeDid: input.cooperativeDid,
        proposalUri: input.proposalUri,
        at: input.at,
      });

    const effectiveDelegations = effectiveCoopDelegationsForProposal(
      activeDelegations,
      input.proposalUri,
    );
    const delegators = delegatorsForTerminal(
      effectiveDelegations,
      input.memberDid,
    );

    let weight = await this.baseWeightFor(
      input.cooperativeDid,
      input.memberDid,
      input.at,
    );

    for (const delegatorDid of delegators) {
      weight += await this.baseWeightFor(
        input.cooperativeDid,
        delegatorDid,
        input.at,
      );
    }

    return weight;
  }

  private async baseWeightFor(
    cooperativeDid: string,
    memberDid: string,
    at: string,
  ): Promise<number> {
    const weight = await this.options.baseWeightReader.getBaseMemberVoteWeight({
      cooperativeDid,
      memberDid,
      at,
    });

    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error(`Invalid base vote weight for ${memberDid}: ${weight}`);
    }

    return weight;
  }
}

export function createCoopDelegatedVoteWeightReader(
  options: CoopDelegatedVoteWeightReaderOptions,
): CoopVoteWeightReader {
  return new CoopDelegatedVoteWeightReader(options);
}

function delegatorsForTerminal(
  delegationsByDelegator: ReadonlyMap<string, CoopVoteWeightDelegation>,
  terminalDid: string,
): readonly string[] {
  const delegators = new Set<string>();
  const cyclicDelegators = findCyclicCoopDelegators(delegationsByDelegator);

  if (cyclicDelegators.has(terminalDid)) {
    return [];
  }

  for (const delegation of delegationsByDelegator.values()) {
    if (cyclicDelegators.has(delegation.delegatorDid)) continue;

    let currentDid = delegation.delegateeDid;
    const visited = new Set<string>([delegation.delegatorDid]);

    while (currentDid !== terminalDid) {
      if (visited.has(currentDid) || cyclicDelegators.has(currentDid)) break;
      visited.add(currentDid);

      const next = delegationsByDelegator.get(currentDid);
      if (!next) break;
      currentDid = next.delegateeDid;
    }

    if (currentDid === terminalDid && !visited.has(currentDid)) {
      delegators.add(delegation.delegatorDid);
    }
  }

  return [...delegators];
}
