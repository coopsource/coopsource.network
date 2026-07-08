import type {
  EligibilityPlugin,
  JsonValue,
} from '@coopsource/governance-view';
import type { CoopVotingEligibilityReader } from './ports.js';

export interface CoopEligibilityPluginOptions {
  readonly eligibilityReader: CoopVotingEligibilityReader;
  readonly includeEvidence?: boolean;
}

export interface CoopEligibilityEvidence {
  readonly source: 'coop-membership-read-model';
  readonly cooperativeDid: string;
  readonly memberDid: string;
  readonly at: string;
}

export class CoopEligibilityPlugin implements EligibilityPlugin {
  constructor(private readonly options: CoopEligibilityPluginOptions) {}

  async canVote(
    input: Parameters<EligibilityPlugin['canVote']>[0],
  ): ReturnType<EligibilityPlugin['canVote']> {
    const result = await this.options.eligibilityReader.canMemberVote(
      input.cooperative.authorityDid,
      input.voter.did,
    );

    const response = result.eligible
      ? { eligible: true }
      : {
          eligible: false,
          reason: result.reason ?? 'not-active-member',
        };

    if (this.options.includeEvidence) {
      const evidence: CoopEligibilityEvidence = {
        source: 'coop-membership-read-model',
        cooperativeDid: input.cooperative.authorityDid,
        memberDid: input.voter.did,
        at: input.at,
      };
      return {
        ...response,
        evidence: evidence as unknown as JsonValue,
      };
    }

    return response;
  }
}

export function createCoopEligibilityPlugin(
  eligibilityReader: CoopVotingEligibilityReader,
  options: Omit<CoopEligibilityPluginOptions, 'eligibilityReader'> = {},
): EligibilityPlugin {
  return new CoopEligibilityPlugin({ eligibilityReader, ...options });
}
