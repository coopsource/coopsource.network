import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spaceRefKey, type SpaceRef, type PulledRecord } from '../types.js';
import { SpacesConsumer } from '../consumer.js';
import { InMemoryNotificationSubscriber } from '../notification-subscriber.js';
import { StaticArbiterMemberList } from '../arbiter-member-list.js';
import { InMemoryRepoPuller } from '../repo-puller.js';
import { UnsafeAlwaysOkEcmhVerifier, FailClosedEcmhVerifier } from '../ecmh-verifier.js';
import { buildPulledRecord, fakeDid } from './helpers/factories.js';

const ref: SpaceRef = { arbiter: fakeDid('did:plc:coop'), type: 'X', skey: 'members' };
const aliceRecord = buildPulledRecord({ space: ref, authorDid: fakeDid('did:plc:alice'), rkey: 'r1', rev: '1' });
const eveRecord = buildPulledRecord({ space: ref, authorDid: fakeDid('did:plc:eve'), rkey: 'r2', rev: '1' });

describe('SpacesConsumer', () => {
  let onAccepted: (r: PulledRecord) => void;
  let consumer: SpacesConsumer;
  let subscriber: InMemoryNotificationSubscriber;
  let memberList: StaticArbiterMemberList;
  const cursorStore = new Map<string, string>();
  const cursors = {
    get: async (space: SpaceRef, member: string) =>
      cursorStore.get(`${spaceRefKey(space)}|${member}`) ?? '',
    set: async (space: SpaceRef, member: string, v: string) => {
      cursorStore.set(`${spaceRefKey(space)}|${member}`, v);
    },
  };

  beforeEach(() => {
    onAccepted = vi.fn<(r: PulledRecord) => void>();
    subscriber = new InMemoryNotificationSubscriber({ clock: () => new Date('2026-05-11T12:00:00Z') });
    memberList = new StaticArbiterMemberList([{ space: ref, members: [fakeDid('did:plc:alice')] }]);
    cursorStore.clear();
    consumer = new SpacesConsumer({
      subscriber,
      memberList,
      puller: new InMemoryRepoPuller([aliceRecord, eveRecord]),
      verifier: new UnsafeAlwaysOkEcmhVerifier(),
      cursors,
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
    expect(cursorStore.get(`${spaceRefKey(ref)}|${fakeDid('did:plc:alice')}`)).toBe('1');
  });

  it('rejects records whose authorDid is not on the member list (defense in depth)', async () => {
    // A compromised member PDS could return records authored by non-members.
    // Simulate by constructing a puller that returns an eve-authored record
    // when pulling for alice. The member list only contains alice, so the
    // per-record cross-check catches eve and increments memberCrossCheckFailures.
    const treacherousMemberList = new StaticArbiterMemberList([{ space: ref, members: [fakeDid('did:plc:alice')] }]);
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
      cursors: { get: async () => '', set: async () => {} },
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

  it('continues to subsequent members when one members pull throws', async () => {
    const onError = vi.fn<(err: unknown, context: { space: SpaceRef; memberDid?: string }) => void>();
    const aliceDid = fakeDid('did:plc:alice');
    const bobDid = fakeDid('did:plc:bob');
    const bobRecord = buildPulledRecord({ space: ref, authorDid: bobDid, rkey: 'b1', rev: '1' });
    const twoMemberList = new StaticArbiterMemberList([{ space: ref, members: [aliceDid, bobDid] }]);
    // Alice's pull throws; Bob's pull returns one record.
    const pullerForBoth = {
      pull: async (req: { memberDid: string }) => {
        if (req.memberDid === aliceDid) throw new Error('alice-pull-fail');
        return [bobRecord];
      },
    };
    const c3 = new SpacesConsumer({
      subscriber, memberList: twoMemberList, puller: pullerForBoth,
      verifier: new UnsafeAlwaysOkEcmhVerifier(),
      cursors: { get: async () => '', set: async () => {} },
      onAccepted, onError,
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    await c3.start([ref]);
    await subscriber.emit(ref, '0');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onAccepted).toHaveBeenCalledWith(bobRecord);
    expect(c3.health().errorCount).toBe(1);
    expect(c3.health().recordsAccepted).toBe(1);
  });

  it('advances cursor to max rev regardless of pull order', async () => {
    const aliceDid = fakeDid('did:plc:alice');
    // Records returned in reverse-rev order: '3', '1', '2'
    const r3 = buildPulledRecord({ space: ref, authorDid: aliceDid, rkey: 'r3', rev: '3' });
    const r1 = buildPulledRecord({ space: ref, authorDid: aliceDid, rkey: 'r1', rev: '1' });
    const r2 = buildPulledRecord({ space: ref, authorDid: aliceDid, rkey: 'r2', rev: '2' });
    const outOfOrderPuller = { pull: async () => [r3, r1, r2] };
    const memberList2 = new StaticArbiterMemberList([{ space: ref, members: [aliceDid] }]);
    const cursorStore2 = new Map<string, string>();
    const c = new SpacesConsumer({
      subscriber,
      memberList: memberList2,
      puller: outOfOrderPuller,
      verifier: new UnsafeAlwaysOkEcmhVerifier(),
      cursors: {
        get: async () => '',
        set: async (space, member, v) => {
          cursorStore2.set(`${spaceRefKey(space)}|${member}`, v);
        },
      },
      onAccepted,
      onError: vi.fn(),
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    await c.start([ref]);
    await subscriber.emit(ref, '0');
    expect(cursorStore2.get(`${spaceRefKey(ref)}|${aliceDid}`)).toBe('3');
  });

  it('awaits async onAccepted handlers', async () => {
    const events: string[] = [];
    const asyncHandler = async (r: PulledRecord) => {
      await Promise.resolve(); // async break to verify onAccepted is awaited
      events.push(`accepted:${r.rkey}`);
    };
    const c = new SpacesConsumer({
      subscriber,
      memberList,
      puller: new InMemoryRepoPuller([aliceRecord]),
      verifier: new UnsafeAlwaysOkEcmhVerifier(),
      cursors: { get: async () => '', set: async () => {} },
      onAccepted: asyncHandler,
      onError: vi.fn(),
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    await c.start([ref]);
    await subscriber.emit(ref, '0');
    // If onAccepted weren't awaited, events would still be empty.
    expect(events).toEqual(['accepted:r1']);
  });
});
