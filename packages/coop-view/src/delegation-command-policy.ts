import type { CoopVoteWeightDelegation } from './ports.js';

export type CoopDelegationCommandPolicyReason =
  | 'self_delegation'
  | 'proposal_uri_required'
  | 'proposal_uri_not_allowed'
  | 'circular_delegation';

export type CoopDelegationCommandPolicyDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: CoopDelegationCommandPolicyReason;
      readonly message: string;
    };

export interface CoopDelegationCommandPolicyInput {
  readonly activeDelegations: readonly CoopVoteWeightDelegation[];
  readonly candidate: CoopVoteWeightDelegation;
}

export function validateCoopDelegationCommand(
  input: CoopDelegationCommandPolicyInput,
): CoopDelegationCommandPolicyDecision {
  const candidate = normalizeDelegation(input.candidate);

  if (candidate.delegatorDid === candidate.delegateeDid) {
    return {
      allowed: false,
      reason: 'self_delegation',
      message: 'Cannot delegate to yourself',
    };
  }

  if (candidate.scope === 'proposal' && !candidate.proposalUri) {
    return {
      allowed: false,
      reason: 'proposal_uri_required',
      message: 'proposalUri is required for proposal scope',
    };
  }

  if (candidate.scope === 'project' && candidate.proposalUri) {
    return {
      allowed: false,
      reason: 'proposal_uri_not_allowed',
      message: 'proposalUri is only valid for proposal scope',
    };
  }

  const delegations = [
    ...input.activeDelegations
      .map(normalizeDelegation)
      .filter((delegation) => !replacesDelegation(candidate, delegation)),
    candidate,
  ];

  for (const proposalUri of affectedProposalContexts(delegations, candidate)) {
    const effective = effectiveCoopDelegationsForProposal(
      delegations,
      proposalUri,
    );
    if (findCyclicCoopDelegators(effective).size > 0) {
      return {
        allowed: false,
        reason: 'circular_delegation',
        message: 'Circular delegation detected',
      };
    }
  }

  return { allowed: true };
}

export function effectiveCoopDelegationsForProposal(
  delegations: readonly CoopVoteWeightDelegation[],
  proposalUri: string | null,
): ReadonlyMap<string, CoopVoteWeightDelegation> {
  const effective = new Map<string, CoopVoteWeightDelegation>();

  for (const delegation of delegations.map(normalizeDelegation)) {
    if (delegation.scope === 'proposal') {
      if (delegation.proposalUri === proposalUri) {
        effective.set(delegation.delegatorDid, delegation);
      }
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

export function findCyclicCoopDelegators(
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

function replacesDelegation(
  candidate: CoopVoteWeightDelegation,
  existing: CoopVoteWeightDelegation,
): boolean {
  return (
    existing.delegatorDid === candidate.delegatorDid &&
    existing.scope === candidate.scope &&
    existing.proposalUri === candidate.proposalUri
  );
}

function affectedProposalContexts(
  delegations: readonly CoopVoteWeightDelegation[],
  candidate: CoopVoteWeightDelegation,
): readonly (string | null)[] {
  if (candidate.scope === 'proposal') {
    return [candidate.proposalUri ?? null];
  }

  const contexts = new Set<string | null>([null]);
  for (const delegation of delegations) {
    if (delegation.scope === 'proposal' && delegation.proposalUri) {
      contexts.add(delegation.proposalUri);
    }
  }
  return [...contexts];
}

function normalizeDelegation(
  delegation: CoopVoteWeightDelegation,
): CoopVoteWeightDelegation {
  return {
    ...delegation,
    proposalUri: delegation.proposalUri ?? null,
  };
}
