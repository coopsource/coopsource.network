import type {
  CoopBaseVoteWeightReader,
  CoopVoteWeightDelegation,
  CoopVoteWeightDelegationReader,
  CoopVoteWeightReader,
} from './ports.js';

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

    const effectiveDelegations = effectiveDelegationByDelegator(
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

function effectiveDelegationByDelegator(
  delegations: readonly CoopVoteWeightDelegation[],
  proposalUri: string,
): ReadonlyMap<string, CoopVoteWeightDelegation> {
  const effective = new Map<string, CoopVoteWeightDelegation>();

  for (const delegation of delegations) {
    const isMatchingProposalDelegation =
      delegation.scope === 'proposal' &&
      delegation.proposalUri === proposalUri;
    if (isMatchingProposalDelegation) {
      effective.set(delegation.delegatorDid, delegation);
      continue;
    }

    if (
      delegation.scope === 'project' &&
      !effective.has(delegation.delegatorDid)
    ) {
      effective.set(delegation.delegatorDid, delegation);
    }
  }

  return effective;
}

function delegatorsForTerminal(
  delegationsByDelegator: ReadonlyMap<string, CoopVoteWeightDelegation>,
  terminalDid: string,
): readonly string[] {
  const delegators = new Set<string>();
  const cyclicDelegators = findCyclicDelegators(delegationsByDelegator);

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

function findCyclicDelegators(
  delegationsByDelegator: ReadonlyMap<string, CoopVoteWeightDelegation>,
): ReadonlySet<string> {
  const cyclic = new Set<string>();

  for (const startDid of delegationsByDelegator.keys()) {
    const path: string[] = [];
    const pathIndexes = new Map<string, number>();
    let currentDid = startDid;

    while (true) {
      const cycleStart = pathIndexes.get(currentDid);
      if (cycleStart !== undefined) {
        for (const did of path.slice(cycleStart)) {
          cyclic.add(did);
        }
        break;
      }

      if (cyclic.has(currentDid)) break;

      const delegation = delegationsByDelegator.get(currentDid);
      if (!delegation) break;

      pathIndexes.set(currentDid, path.length);
      path.push(currentDid);
      currentDid = delegation.delegateeDid;
    }
  }

  return cyclic;
}
