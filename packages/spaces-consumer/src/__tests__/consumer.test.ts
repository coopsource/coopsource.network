import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PulledRecord, SpaceRef } from '../types.js';
import { SpacesConsumer } from '../consumer.js';
import { InMemoryNotificationSubscriber } from '../notification-subscriber.js';
import { StaticArbiterMemberList } from '../arbiter-member-list.js';
import { InMemoryRepoPuller } from '../repo-puller.js';
import { UnsafeAlwaysOkEcmhVerifier, FailClosedEcmhVerifier } from '../ecmh-verifier.js';
import { buildPulledRecord, fakeDid } from './helpers/factories.js';
import { spaceRefKey } from '../types.js';

const ref: SpaceRef = { arbiter: fakeDid('did:plc:coop'), type: 'X', skey: 'members' };
const aliceRecord = buildPulledRecord({ space: ref, authorDid: fakeDid('did:plc:alice'), rkey: 'r1', rev: '1' });
const eveRecord = buildPulledRecord({ space: ref, authorDid: fakeDid('did:plc:eve'), rkey: 'r2', rev: '1' });

describe('SpacesConsumer', () => {
  let onAccepted: (r: PulledRecord) => void;
  let consumer: SpacesConsumer;
  let subscriber: InMemoryNotificationSubscriber;
  let memberList: StaticArbiterMemberList;
  const cursorStore = new Map<string, string>();

  beforeEach(() => {
    onAccepted = vi.fn<(r: PulledRecord) => void>();
    subscriber = new InMemoryNotificationSubscriber({ clock: () => new Date('2026-05-11T12:00:00Z') });
    memberList = new StaticArbiterMemberList({
      [`${ref.arbiter}|${ref.type}|${ref.skey}`]: [fakeDid('did:plc:alice')],
    });
    cursorStore.clear();
    consumer = new SpacesConsumer({
      subscriber,
      memberList,
      puller: new InMemoryRepoPuller([aliceRecord, eveRecord]),
      verifier: new UnsafeAlwaysOkEcmhVerifier(),
      cursors: {
        get: async (k) => cursorStore.get(k) ?? '',
        set: async (k, v) => { cursorStore.set(k, v); },
      },
      onAccepted,
      onError: vi.fn<(err: unknown, context: { space: SpaceRef; memberDid?: string }) => void>(),
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
  });

  it('subscribes to a space, accepts member records, rejects non-member records', async () => {
    await consumer.start([ref]);
    await subscriber.emit(ref, '0');
    expect(onAccepted).toHaveBeenCalledTimes(1);
    expect(onAccepted).toHaveBeenCalledWith(aliceRecord);
  });

  it('advances the cursor after accepting records', async () => {
    await consumer.start([ref]);
    await subscriber.emit(ref, '0');
    const cursorKey = `${spaceRefKey(ref)}|${fakeDid('did:plc:alice')}`;
    expect(cursorStore.get(cursorKey)).toBe('1');
  });

  it('counts member-cross-check failures in health (defense in depth even though eve is not iterated as a member)', async () => {
    // Eve is in the puller's records but not on the member list, so memberList.list returns only alice.
    // alice is iterated; eve's record never reaches the per-record cross-check in this configuration.
    // To force the defense-in-depth path, we need a puller that returns a non-member record while
    // iterating alice. That requires a different puller setup.
    const treacherousMemberList = new StaticArbiterMemberList({
      [`${ref.arbiter}|${ref.type}|${ref.skey}`]: [fakeDid('did:plc:alice')],
    });
    // Use a custom puller that returns eve-authored records when pulling for alice
    const forgedRecord = buildPulledRecord({ space: ref, authorDid: fakeDid('did:plc:eve'), rkey: 'forged', rev: '2' });
    const compromisedPuller = {
      pull: async () => [forgedRecord],
    };
    const c2 = new SpacesConsumer({
      subscriber,
      memberList: treacherousMemberList,
      puller: compromisedPuller,
      verifier: new UnsafeAlwaysOkEcmhVerifier(),
      cursors: {
        get: async () => '',
        set: async () => {},
      },
      onAccepted,
      onError: vi.fn<(err: unknown, context: { space: SpaceRef; memberDid?: string }) => void>(),
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    await c2.start([ref]);
    await subscriber.emit(ref, '0');
    expect(c2.health().memberCrossCheckFailures).toBeGreaterThanOrEqual(1);
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('counts digest mismatches and skips records when verifier fails closed', async () => {
    const failConsumer = new SpacesConsumer({
      subscriber, memberList,
      puller: new InMemoryRepoPuller([aliceRecord]),
      verifier: new FailClosedEcmhVerifier(),
      cursors: { get: async () => '', set: async () => {} },
      onAccepted, onError: vi.fn<(err: unknown, context: { space: SpaceRef; memberDid?: string }) => void>(),
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    await failConsumer.start([ref]);
    await subscriber.emit(ref, '0');
    expect(onAccepted).not.toHaveBeenCalled();
    expect(failConsumer.health().digestMismatches).toBe(1);
  });

  it('reports errors via onError callback (no silent swallowing)', async () => {
    const onError = vi.fn<(err: unknown, context: { space: SpaceRef; memberDid?: string }) => void>();
    const throwingPuller = { pull: async () => { throw new Error('puller-boom'); } };
    const throwConsumer = new SpacesConsumer({
      subscriber, memberList, puller: throwingPuller,
      verifier: new UnsafeAlwaysOkEcmhVerifier(),
      cursors: { get: async () => '', set: async () => {} },
      onAccepted, onError,
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    await throwConsumer.start([ref]);
    await subscriber.emit(ref, '0');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'puller-boom' }), expect.any(Object));
    expect(throwConsumer.health().errorCount).toBe(1);
  });
});
