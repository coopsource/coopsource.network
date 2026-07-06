import type {
  JsonValue,
  VoteWeightPlugin,
} from '@coopsource/governance-view';
import type { CoopVoteWeightReader } from './ports.js';

export interface CoopVoteWeightPluginOptions {
  readonly weightReader: CoopVoteWeightReader;
  readonly includeEvidence?: boolean;
}

export interface CoopVoteWeightEvidence {
  readonly source: 'coop-membership-read-model';
  readonly cooperativeDid: string;
  readonly memberDid: string;
  readonly at: string;
}

export class CoopVoteWeightPlugin implements VoteWeightPlugin {
  constructor(private readonly options: CoopVoteWeightPluginOptions) {}

  async weightForVote(
    input: Parameters<VoteWeightPlugin['weightForVote']>[0],
  ): ReturnType<VoteWeightPlugin['weightForVote']> {
    const weight = await this.options.weightReader.getProjectedMemberVoteWeight({
      cooperativeDid: input.cooperative.authorityDid,
      memberDid: input.voter.did,
      proposalUri: input.proposal.uri,
      voteChoice: input.voteChoice,
      at: input.at,
    });

    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error(
        `Invalid projected member vote weight for ${input.voter.did}: ${weight}`,
      );
    }

    if (this.options.includeEvidence) {
      const evidence: CoopVoteWeightEvidence = {
        source: 'coop-membership-read-model',
        cooperativeDid: input.cooperative.authorityDid,
        memberDid: input.voter.did,
        at: input.at,
      };
      return {
        weight,
        evidence: evidence as unknown as JsonValue,
      };
    }

    return { weight };
  }
}

export function createCoopVoteWeightPlugin(
  weightReader: CoopVoteWeightReader,
  options: Omit<CoopVoteWeightPluginOptions, 'weightReader'> = {},
): VoteWeightPlugin {
  return new CoopVoteWeightPlugin({ weightReader, ...options });
}
