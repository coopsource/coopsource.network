import type { GovernancePluginSet } from './plugins.js';
import {
  decideGovernanceProposalOutcome,
  reduceGovernanceVoteTally,
} from './tally.js';
import type {
  GovernanceProposalLifecycleAction,
  GovernanceProposalLifecycleDecision,
  GovernanceProposalExpiryAction,
} from './proposal-lifecycle.js';
import {
  evaluateGovernanceProposalAction,
  planGovernanceProposalExpiry,
} from './proposal-lifecycle.js';
import type {
  GovernanceProposalOutcomeInput,
  GovernanceVoteChoiceForTally,
  GovernanceVoteTally,
} from './types.js';

export class GovernanceView {
  constructor(readonly plugins: GovernancePluginSet) {}

  reduceVoteTally(
    votes: ReadonlyArray<GovernanceVoteChoiceForTally>,
  ): GovernanceVoteTally {
    return reduceGovernanceVoteTally(votes);
  }

  decideProposalOutcome(input: GovernanceProposalOutcomeInput): string {
    return decideGovernanceProposalOutcome(input);
  }

  evaluateProposalAction(
    status: string,
    action: GovernanceProposalLifecycleAction,
  ): GovernanceProposalLifecycleDecision {
    return evaluateGovernanceProposalAction(status, action);
  }

  planProposalExpiry(
    status: string,
  ): ReadonlyArray<GovernanceProposalExpiryAction> {
    return planGovernanceProposalExpiry(status);
  }
}
