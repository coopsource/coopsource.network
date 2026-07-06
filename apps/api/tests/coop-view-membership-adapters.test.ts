import { describe, expect, it } from 'vitest';
import type { DID } from '@coopsource/common';
import {
  MembershipReadModelVoteWeightReader,
  MembershipReadModelVotingEligibilityReader,
} from '../src/services/coop-view-membership-adapters.js';
import { membershipAuthorityFailure } from '../src/services/membership-read-model.js';

describe('MembershipReadModelVoteWeightReader', () => {
  it('delegates projected vote weight reads to MembershipReadModel', async () => {
    const events: string[] = [];
    const reader = new MembershipReadModelVoteWeightReader({
      async getProjectedMemberVoteWeight(cooperativeDid: DID, memberDid: DID) {
        events.push(`reader-start:${cooperativeDid}:${memberDid}`);
        await Promise.resolve();
        events.push('reader-finish');
        return 4;
      },
    });

    events.push('call-start');
    const weight = await reader.getProjectedMemberVoteWeight({
      cooperativeDid: 'did:plc:coop',
      memberDid: 'did:plc:alice',
      proposalUri:
        'at://did:plc:coop/network.coopsource.governance.proposal/abc',
      voteChoice: 'yes',
      at: '2026-07-06T12:00:00.000Z',
    });
    events.push('call-finish');

    expect(weight).toBe(4);
    expect(events).toEqual([
      'call-start',
      'reader-start:did:plc:coop:did:plc:alice',
      'reader-finish',
      'call-finish',
    ]);
  });

  it('propagates membership authority failures', async () => {
    const reader = new MembershipReadModelVoteWeightReader({
      async getProjectedMemberVoteWeight() {
        await Promise.resolve();
        throw new Error('Membership authority returned stale data');
      },
    });

    await expect(
      reader.getProjectedMemberVoteWeight({
        cooperativeDid: 'did:plc:coop',
        memberDid: 'did:plc:alice',
        proposalUri:
          'at://did:plc:coop/network.coopsource.governance.proposal/abc',
        voteChoice: 'yes',
        at: '2026-07-06T12:00:00.000Z',
      }),
    ).rejects.toThrow('Membership authority returned stale data');
  });
});

describe('MembershipReadModelVotingEligibilityReader', () => {
  it('returns eligible for active memberships', async () => {
    const events: string[] = [];
    const reader = new MembershipReadModelVotingEligibilityReader({
      async getActiveMembershipResult(cooperativeDid: DID, memberDid: DID) {
        events.push(`reader-start:${cooperativeDid}:${memberDid}`);
        await Promise.resolve();
        events.push('reader-finish');
        return {
          ok: true,
          membership: {
            membershipId: 'membership-1',
            cooperativeDid,
            memberDid,
            status: 'active',
            roles: ['member'],
            joinedAt: null,
          },
        };
      },
    });

    events.push('call-start');
    const result = await reader.canMemberVote(
      'did:plc:coop',
      'did:plc:alice',
    );
    events.push('call-finish');

    expect(result).toEqual({ eligible: true });
    expect(events).toEqual([
      'call-start',
      'reader-start:did:plc:coop:did:plc:alice',
      'reader-finish',
      'call-finish',
    ]);
  });

  it('returns ineligible for explicit non-members', async () => {
    const reader = new MembershipReadModelVotingEligibilityReader({
      async getActiveMembershipResult() {
        return membershipAuthorityFailure(
          'not-member',
          'No active membership',
        );
      },
    });

    await expect(
      reader.canMemberVote('did:plc:coop', 'did:plc:alice'),
    ).resolves.toEqual({
      eligible: false,
      reason: 'No active membership',
    });
  });

  it('propagates stale membership authority failures as service errors', async () => {
    const reader = new MembershipReadModelVotingEligibilityReader({
      async getActiveMembershipResult() {
        await Promise.resolve();
        return membershipAuthorityFailure(
          'stale',
          'Membership authority returned stale data',
        );
      },
    });

    await expect(
      reader.canMemberVote('did:plc:coop', 'did:plc:alice'),
    ).rejects.toMatchObject({
      code: 'SPACES_AUTHORITY_UNAVAILABLE',
      statusCode: 503,
      axis: 'spaces',
      reason: 'stale',
    });
  });
});
