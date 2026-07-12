import { describe, expect, it } from 'vitest';
import { CoopView } from './index.js';

describe('CoopView', () => {
  it('provides a complete frozen plugin set from cooperative overrides', async () => {
    const voteWeight = {
      async weightForVote() {
        return { weight: 3 };
      },
    };
    const view = new CoopView({ voteWeight });

    expect(Object.isFrozen(view.plugins)).toBe(true);
    expect(view.plugins.voteWeight).toBe(voteWeight);
    await expect(
      view.plugins.meetingMinutes.canonicalize({
        cooperative: { authorityDid: 'did:plc:coop', spaceKey: 'members' },
        sourceRecords: [],
      }),
    ).resolves.toEqual({ minutes: null });
  });
});
