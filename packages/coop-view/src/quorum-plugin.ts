import type {
  GovernanceTallyInput,
  JsonValue,
  QuorumPlugin,
} from '@coopsource/governance-view';
import { evaluateGovernanceHeadcountQuorum } from '@coopsource/governance-view';

export interface CoopQuorumPluginOptions {
  readonly includeEvidence?: boolean;
}

export interface CoopQuorumClassCheck {
  readonly className: string;
  readonly voteCount: number;
  readonly voteWeight: number;
  readonly totalWeight?: number;
  readonly met: boolean;
  readonly reason?: 'min_votes' | 'min_weight_ratio';
}

export interface CoopQuorumEvidence {
  readonly source: 'coop-quorum-rules';
  readonly voteCount: number;
  readonly eligibleVoterCount: number;
  readonly threshold?: number;
  readonly classChecks: readonly CoopQuorumClassCheck[];
}

export class CoopQuorumPlugin implements QuorumPlugin {
  constructor(private readonly options: CoopQuorumPluginOptions = {}) {}

  async evaluate(
    input: GovernanceTallyInput,
  ): ReturnType<QuorumPlugin['evaluate']> {
    const headcount = evaluateGovernanceHeadcountQuorum(
      input.quorum,
      input.votes.length,
      input.eligibleVoterCount,
    );
    const headcountMet = headcount.met;
    const classChecks = headcountMet ? evaluateClassQuorum(input) : [];
    const classMet = classChecks.every((check) => check.met);
    const met = headcountMet && classMet;

    const outcomeReason = met
      ? 'met'
      : headcountMet
        ? 'class_quorum_not_met'
        : 'no_quorum';

    if (this.options.includeEvidence) {
      const evidence: CoopQuorumEvidence = {
        source: 'coop-quorum-rules',
        voteCount: input.votes.length,
        eligibleVoterCount: input.eligibleVoterCount,
        ...(headcount.threshold === undefined
          ? {}
          : { threshold: headcount.threshold }),
        classChecks,
      };
      return {
        met,
        outcomeReason,
        evidence: evidence as unknown as JsonValue,
      };
    }

    return { met, outcomeReason };
  }
}

export function createCoopQuorumPlugin(
  options: CoopQuorumPluginOptions = {},
): QuorumPlugin {
  return new CoopQuorumPlugin(options);
}

function evaluateClassQuorum(
  input: GovernanceTallyInput,
): readonly CoopQuorumClassCheck[] {
  const rules = input.classQuorumRules;
  if (!rules) return [];

  return Object.entries(rules).map(([className, rule]) => {
    const classVotes = input.votes.filter(
      (vote) => vote.memberClass === className,
    );
    const voteWeight = classVotes.reduce(
      (sum, vote) => sum + (vote.weight ?? 1),
      0,
    );

    if (
      rule.minVotes !== undefined &&
      classVotes.length < rule.minVotes
    ) {
      return {
        className,
        voteCount: classVotes.length,
        voteWeight,
        met: false,
        reason: 'min_votes',
      };
    }

    const totalWeight = input.classDenominators?.find(
      (denominator) => denominator.className === className,
    )?.totalWeight;
    if (
      rule.minWeightRatio !== undefined &&
      totalWeight !== undefined &&
      totalWeight > 0 &&
      voteWeight / totalWeight < rule.minWeightRatio
    ) {
      return {
        className,
        voteCount: classVotes.length,
        voteWeight,
        totalWeight,
        met: false,
        reason: 'min_weight_ratio',
      };
    }

    return {
      className,
      voteCount: classVotes.length,
      voteWeight,
      ...(totalWeight === undefined ? {} : { totalWeight }),
      met: true,
    };
  });
}
