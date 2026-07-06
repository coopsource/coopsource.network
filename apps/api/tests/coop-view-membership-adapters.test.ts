import { describe, expect, it } from 'vitest';
import type { DID } from '@coopsource/common';
import { MembershipReadModelVoteWeightReader } from '../src/services/coop-view-membership-adapters.js';

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
    const weight = await reader.getProjectedMemberVoteWeight(
      'did:plc:coop',
      'did:plc:alice',
    );
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
      reader.getProjectedMemberVoteWeight('did:plc:coop', 'did:plc:alice'),
    ).rejects.toThrow('Membership authority returned stale data');
  });
});
