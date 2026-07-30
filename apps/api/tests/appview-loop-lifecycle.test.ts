import type { IdentityEvent } from '@atproto/tap';
import { describe, expect, it } from 'vitest';
import { tapIdentityToRepoLifecycleEvents } from '../src/appview/loop.js';

describe('AppView repo lifecycle normalization', () => {
  it('splits a Tap identity event into ordered identity and account hints', () => {
    const event: IdentityEvent = {
      id: 42,
      type: 'identity',
      did: 'did:plc:alice',
      handle: 'alice.example',
      isActive: false,
      status: 'suspended',
    };

    expect(
      tapIdentityToRepoLifecycleEvents(event, '2026-07-30T12:00:00Z'),
    ).toEqual([
      {
        kind: 'identity',
        seq: 42,
        did: 'did:plc:alice',
        time: '2026-07-30T12:00:00Z',
        handle: 'alice.example',
      },
      {
        kind: 'account',
        seq: 42,
        did: 'did:plc:alice',
        time: '2026-07-30T12:00:00Z',
        active: false,
        status: 'suspended',
      },
    ]);
  });

  it('does not repeat Tap active status in the account status field', () => {
    const event: IdentityEvent = {
      id: 43,
      type: 'identity',
      did: 'did:plc:alice',
      handle: 'alice.example',
      isActive: true,
      status: 'active',
    };

    expect(
      tapIdentityToRepoLifecycleEvents(event, '2026-07-30T12:01:00Z')[1],
    ).toEqual({
      kind: 'account',
      seq: 43,
      did: 'did:plc:alice',
      time: '2026-07-30T12:01:00Z',
      active: true,
    });
  });
});
