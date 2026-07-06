import { describe, expect, it } from 'vitest';
import {
  CoopVoteWeightPlugin,
  createCoopVoteWeightPlugin,
  type CoopVoteWeightReader,
} from './index.js';

const input = {
  voter: { did: 'did:plc:alice' },
  proposal: {
    uri: 'at://did:plc:coop/network.coopsource.governance.proposal/abc',
    collection: 'network.coopsource.governance.proposal',
  },
  cooperative: {
    authorityDid: 'did:plc:coop',
    spaceKey: 'members',
    spaceType: 'network.coopsource.org.spaceType.members',
  },
  voteChoice: 'yes',
  at: '2026-07-06T12:00:00.000Z',
};

describe('CoopVoteWeightPlugin', () => {
  it('delegates vote weight to the projected membership reader', async () => {
    const events: string[] = [];
    const reader: CoopVoteWeightReader = {
      async getProjectedMemberVoteWeight(cooperativeDid, memberDid) {
        events.push(`reader-start:${cooperativeDid}:${memberDid}`);
        await Promise.resolve();
        events.push('reader-finish');
        return 2.5;
      },
    };
    const plugin = createCoopVoteWeightPlugin(reader);

    events.push('call-start');
    const result = await plugin.weightForVote(input);
    events.push('call-finish');

    expect(result).toEqual({ weight: 2.5 });
    expect(events).toEqual([
      'call-start',
      'reader-start:did:plc:coop:did:plc:alice',
      'reader-finish',
      'call-finish',
    ]);
  });

  it('can include internal evidence for adapter tracing', async () => {
    const plugin = new CoopVoteWeightPlugin({
      includeEvidence: true,
      weightReader: {
        async getProjectedMemberVoteWeight() {
          return 3;
        },
      },
    });

    await expect(plugin.weightForVote(input)).resolves.toEqual({
      weight: 3,
      evidence: {
        source: 'coop-membership-read-model',
        cooperativeDid: 'did:plc:coop',
        memberDid: 'did:plc:alice',
        at: '2026-07-06T12:00:00.000Z',
      },
    });
  });

  it('propagates membership authority failures instead of falling back to default weight', async () => {
    const plugin = createCoopVoteWeightPlugin({
      async getProjectedMemberVoteWeight() {
        await Promise.resolve();
        throw new Error('Membership authority returned a partial result');
      },
    });

    await expect(plugin.weightForVote(input)).rejects.toThrow(
      'Membership authority returned a partial result',
    );
  });

  it('rejects invalid projected weights', async () => {
    const plugin = createCoopVoteWeightPlugin({
      async getProjectedMemberVoteWeight() {
        return Number.NaN;
      },
    });

    await expect(plugin.weightForVote(input)).rejects.toThrow(
      'Invalid projected member vote weight',
    );
  });
});
