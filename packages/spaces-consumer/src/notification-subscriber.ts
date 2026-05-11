import { spaceRefKey, type ClockedOptions, type SpaceNotification, type SpaceRef } from './types.js';

export type NotificationHandler = (n: SpaceNotification) => Promise<void> | void;

/**
 * Subscribe to write-occurred notifications on a space. Real implementations
 * (Stage 2+) wrap the arbiter's notification XRPC; Stage 1 ships an in-memory
 * subscriber that's exercised via emit() in tests and dev fixtures.
 */
export interface NotificationSubscriber {
  subscribe(space: SpaceRef, handler: NotificationHandler): Promise<void>;
  unsubscribe(space: SpaceRef): Promise<void>;
}

/**
 * Test/dev-fixture sketch. emit() is part of the test surface; it is not on
 * the NotificationSubscriber interface because real implementations don't
 * synthesize notifications, they receive them from upstream.
 */
export class InMemoryNotificationSubscriber implements NotificationSubscriber {
  private readonly handlers = new Map<string, NotificationHandler>();
  constructor(private readonly opts: ClockedOptions) {}

  async subscribe(space: SpaceRef, handler: NotificationHandler): Promise<void> {
    this.handlers.set(spaceRefKey(space), handler);
  }

  async unsubscribe(space: SpaceRef): Promise<void> {
    this.handlers.delete(spaceRefKey(space));
  }

  async emit(space: SpaceRef, since: string, digest?: string): Promise<void> {
    const h = this.handlers.get(spaceRefKey(space));
    if (!h) return;
    await h({ space, since, digest, receivedAt: this.opts.clock() });
  }
}
