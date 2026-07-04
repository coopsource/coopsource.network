import { describe, it, expect, vi } from 'vitest';
import { InMemoryNotificationSubscriber } from '../notification-subscriber.js';
import type { SpaceRef } from '../types.js';
import { fakeDid } from './helpers/factories.js';

const ref: SpaceRef = { arbiterDid: fakeDid('did:plc:coop'), spaceKey: 'members', expectedSpaceType: 'X' };

describe('InMemoryNotificationSubscriber', () => {
  it('delivers an emitted notification to a subscribed handler', async () => {
    const sub = new InMemoryNotificationSubscriber({ clock: () => new Date('2026-05-11T12:00:00Z') });
    const handler = vi.fn();
    await sub.subscribe(ref, handler);
    await sub.emit(ref, 'rev-1');
    expect(handler).toHaveBeenCalledWith({ space: ref, since: 'rev-1', receivedAt: expect.any(Date) });
  });

  it('does not deliver to unsubscribed spaces', async () => {
    const sub = new InMemoryNotificationSubscriber({ clock: () => new Date() });
    const handler = vi.fn();
    await sub.subscribe(ref, handler);
    await sub.emit({ ...ref, spaceKey: 'other' }, 'rev-1');
    expect(handler).not.toHaveBeenCalled();
  });
});
