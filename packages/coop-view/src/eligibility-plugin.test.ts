import { describe, expect, it } from 'vitest';
import {
  CoopEligibilityPlugin,
  createCoopEligibilityPlugin,
  type CoopVotingEligibilityReader,
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
  at: '2026-07-06T12:00:00.000Z',
};

describe('CoopEligibilityPlugin', () => {
  it('delegates voting eligibility to the membership reader', async () => {
    const events: string[] = [];
    const reader: CoopVotingEligibilityReader = {
      async canMemberVote(cooperativeDid, memberDid) {
        events.push(`reader-start:${cooperativeDid}:${memberDid}`);
        await Promise.resolve();
        events.push('reader-finish');
        return { eligible: true };
      },
    };
    const plugin = createCoopEligibilityPlugin(reader);

    events.push('call-start');
    const result = await plugin.canVote(input);
    events.push('call-finish');

    expect(result).toEqual({ eligible: true });
    expect(events).toEqual([
      'call-start',
      'reader-start:did:plc:coop:did:plc:alice',
      'reader-finish',
      'call-finish',
    ]);
  });

  it('returns the membership reader reason when a member cannot vote', async () => {
    const plugin = createCoopEligibilityPlugin({
      async canMemberVote() {
        return {
          eligible: false,
          reason: 'No active membership',
        };
      },
    });

    await expect(plugin.canVote(input)).resolves.toEqual({
      eligible: false,
      reason: 'No active membership',
    });
  });

  it('uses a stable default reason when the reader omits one', async () => {
    const plugin = createCoopEligibilityPlugin({
      async canMemberVote() {
        return { eligible: false };
      },
    });

    await expect(plugin.canVote(input)).resolves.toEqual({
      eligible: false,
      reason: 'not-active-member',
    });
  });

  it('can include internal evidence for adapter tracing', async () => {
    const plugin = new CoopEligibilityPlugin({
      includeEvidence: true,
      eligibilityReader: {
        async canMemberVote() {
          return { eligible: true };
        },
      },
    });

    await expect(plugin.canVote(input)).resolves.toEqual({
      eligible: true,
      evidence: {
        source: 'coop-membership-read-model',
        cooperativeDid: 'did:plc:coop',
        memberDid: 'did:plc:alice',
        at: '2026-07-06T12:00:00.000Z',
      },
    });
  });

  it('propagates membership authority failures instead of treating them as ineligible', async () => {
    const plugin = createCoopEligibilityPlugin({
      async canMemberVote() {
        await Promise.resolve();
        throw new Error('Membership authority returned stale data');
      },
    });

    await expect(plugin.canVote(input)).rejects.toThrow(
      'Membership authority returned stale data',
    );
  });
});
