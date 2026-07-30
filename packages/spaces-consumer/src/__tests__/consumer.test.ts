import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SpacesConsumer,
  type RejectedPermissionedRecord,
} from '../consumer.js';
import type { DidEquivalencePort } from '../did-equivalence-port.js';
import {
  StaticGroupDirectoryPort,
  type GroupDirectoryPort,
} from '../group-directory-port.js';
import { InMemoryPermissionedRepoPort } from '../permissioned-repo-port.js';
import type {
  ResolvedMembers,
  SpaceRef,
  VerifiedPermissionedRecord,
} from '../types.js';
import { buildVerifiedRecord, fakeCid, fakeDid } from './helpers/factories.js';

const ref: SpaceRef = {
  arbiterDid: fakeDid('did:plc:coop'),
  spaceKey: 'members',
  expectedSpaceType: 'X',
};
const aliceDid = fakeDid('did:plc:alice');
const alicePriorDid = fakeDid('did:plc:alice-old');
const eveDid = fakeDid('did:plc:eve');
const aliceRecord = buildVerifiedRecord({
  space: ref,
  authorDid: aliceDid,
  rkey: 'r1',
  sourceRevision: '1',
});
const alicePriorRecord = buildVerifiedRecord({
  space: ref,
  authorDid: alicePriorDid,
  rkey: 'r0',
  sourceRevision: '1',
});
const eveRecord = buildVerifiedRecord({
  space: ref,
  authorDid: eveDid,
  rkey: 'r2',
  sourceRevision: '2',
});

describe('SpacesConsumer', () => {
  let onAccepted: (record: VerifiedPermissionedRecord) => void;
  let onRejected: (rejection: RejectedPermissionedRecord) => void;

  beforeEach(() => {
    onAccepted = vi.fn<(record: VerifiedPermissionedRecord) => void>();
    onRejected = vi.fn<(rejection: RejectedPermissionedRecord) => void>();
  });

  it('accepts verified member records and commits the checkpoint', async () => {
    const repo = new InMemoryPermissionedRepoPort({
      records: [aliceRecord],
      verification: 'verified',
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    const consumer = new SpacesConsumer({
      groupDirectory: new StaticGroupDirectoryPort([
        { space: ref, members: [aliceDid] },
      ]),
      permissionedRepo: repo,
      onAccepted,
      onRejected,
      onError: vi.fn(),
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });

    await consumer.start([ref]);
    await repo.emit(ref);

    expect(onAccepted).toHaveBeenCalledWith(aliceRecord);
    expect(onRejected).not.toHaveBeenCalled();
    expect(await repo.committedCheckpoint(ref)).toBe('1');
    expect(consumer.health().recordsAccepted).toBe(1);
  });

  it('rejects verified non-member records and still commits the checkpoint', async () => {
    const repo = new InMemoryPermissionedRepoPort({
      records: [eveRecord],
      verification: 'verified',
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    const consumer = new SpacesConsumer({
      groupDirectory: new StaticGroupDirectoryPort([
        { space: ref, members: [aliceDid] },
      ]),
      permissionedRepo: repo,
      onAccepted,
      onRejected,
      onError: vi.fn(),
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });

    await consumer.start([ref]);
    await repo.emit(ref);

    expect(onAccepted).not.toHaveBeenCalled();
    expect(onRejected).toHaveBeenCalledWith({
      record: eveRecord,
      reason: 'not-member',
    });
    expect(await repo.committedCheckpoint(ref)).toBe('2');
    expect(consumer.health().recordsRejected).toBe(1);
    // A non-member record is an expected, successful cross-check outcome — it is
    // rejected but is NOT a cross-check *failure*, so this counter stays 0.
    expect(consumer.health().memberCrossCheckFailures).toBe(0);
  });

  it('applies verified tombstones after the author leaves the space', async () => {
    const tombstone = buildVerifiedRecord({
      space: ref,
      authorDid: eveDid,
      rkey: 'former-member-vote',
      sourceRevision: '3',
      operation: 'delete',
      previousCid: fakeCid('cid-2'),
    });
    const repo = new InMemoryPermissionedRepoPort({
      records: [tombstone],
      verification: 'verified',
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    const consumer = new SpacesConsumer({
      groupDirectory: new StaticGroupDirectoryPort([
        { space: ref, members: [aliceDid] },
      ]),
      permissionedRepo: repo,
      onAccepted,
      onRejected,
      onError: vi.fn(),
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });

    await consumer.start([ref]);
    await repo.emit(ref);

    expect(onAccepted).toHaveBeenCalledWith(tombstone);
    expect(onRejected).not.toHaveBeenCalled();
    expect(await repo.committedCheckpoint(ref)).toBe('3');
    expect(consumer.health().recordsAccepted).toBe(1);
  });

  it('accepts records from a prior DID when the equivalence port maps it to a current member DID', async () => {
    const repo = new InMemoryPermissionedRepoPort({
      records: [alicePriorRecord],
      verification: 'verified',
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    const didEquivalence: DidEquivalencePort = {
      areEquivalent: vi.fn(async (memberDid, authorDid) => {
        await Promise.resolve();
        return memberDid === aliceDid && authorDid === alicePriorDid;
      }),
    };
    const consumer = new SpacesConsumer({
      groupDirectory: new StaticGroupDirectoryPort([
        { space: ref, members: [aliceDid] },
      ]),
      didEquivalence,
      permissionedRepo: repo,
      onAccepted,
      onRejected,
      onError: vi.fn(),
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });

    await consumer.start([ref]);
    await repo.emit(ref);

    expect(didEquivalence.areEquivalent).toHaveBeenCalledWith(
      aliceDid,
      alicePriorDid,
    );
    expect(onAccepted).toHaveBeenCalledWith(alicePriorRecord);
    expect(onRejected).not.toHaveBeenCalled();
    expect(await repo.committedCheckpoint(ref)).toBe('1');
  });

  it('fails closed when DID equivalence cannot be resolved', async () => {
    const repo = new InMemoryPermissionedRepoPort({
      records: [alicePriorRecord],
      verification: 'verified',
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    const onError = vi.fn();
    const consumer = new SpacesConsumer({
      groupDirectory: new StaticGroupDirectoryPort([
        { space: ref, members: [aliceDid] },
      ]),
      didEquivalence: {
        areEquivalent: async () => {
          throw new Error('rotation lookup failed');
        },
      },
      permissionedRepo: repo,
      onAccepted,
      onRejected,
      onError,
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });

    await consumer.start([ref]);
    await repo.emit(ref);

    expect(onAccepted).not.toHaveBeenCalled();
    expect(onRejected).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'rotation lookup failed' }),
      expect.objectContaining({ authorDid: alicePriorDid }),
    );
    expect(await repo.committedCheckpoint(ref)).toBeUndefined();
    expect(consumer.health().recordsRejected).toBe(1);
    expect(consumer.health().memberCrossCheckFailures).toBe(1);
  });

  it('does not call handlers or commit checkpoints when verification fails closed', async () => {
    const repo = new InMemoryPermissionedRepoPort({
      records: [aliceRecord],
      verification: 'failed-closed',
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    const consumer = new SpacesConsumer({
      groupDirectory: new StaticGroupDirectoryPort([
        { space: ref, members: [aliceDid] },
      ]),
      permissionedRepo: repo,
      onAccepted,
      onRejected,
      onError: vi.fn(),
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });

    await consumer.start([ref]);
    await repo.emit(ref);

    expect(onAccepted).not.toHaveBeenCalled();
    expect(onRejected).not.toHaveBeenCalled();
    expect(await repo.committedCheckpoint(ref)).toBeUndefined();
    expect(consumer.health().verificationFailures).toBe(1);
  });

  it('fails closed and does not checkpoint stale strict membership resolution', async () => {
    const repo = new InMemoryPermissionedRepoPort({
      records: [aliceRecord],
      verification: 'verified',
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    const staleDirectory: GroupDirectoryPort = {
      listSpaces: async () => ({ spaces: [] }),
      getSpaceConfig: async () => ({ ok: true, space: ref, stale: true }),
      getDirectSpaceMembers: async () => [],
      resolveSpaceMembers: async (): Promise<ResolvedMembers> => ({
        ok: true,
        directMembers: [],
        members: [
          {
            did: aliceDid,
            via: [ref],
            directMember: { kind: 'did', did: aliceDid },
            resolverDepth: 0,
          },
        ],
        missingSpaces: [],
        partial: false,
        stale: true,
        resolverDepth: 0,
      }),
    };
    const onError = vi.fn();
    const consumer = new SpacesConsumer({
      groupDirectory: staleDirectory,
      permissionedRepo: repo,
      onAccepted,
      onRejected,
      onError,
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });

    await consumer.start([ref]);
    await repo.emit(ref);

    expect(onAccepted).not.toHaveBeenCalled();
    expect(onRejected).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    expect(await repo.committedCheckpoint(ref)).toBeUndefined();
    expect(consumer.health().recordsRejected).toBe(1);
    // Indeterminate (stale/partial) resolution IS a genuine cross-check failure.
    expect(consumer.health().memberCrossCheckFailures).toBe(1);
  });

  it('does not checkpoint when onAccepted throws', async () => {
    const repo = new InMemoryPermissionedRepoPort({
      records: [aliceRecord],
      verification: 'verified',
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    const onError = vi.fn();
    const consumer = new SpacesConsumer({
      groupDirectory: new StaticGroupDirectoryPort([
        { space: ref, members: [aliceDid] },
      ]),
      permissionedRepo: repo,
      onAccepted: async () => {
        throw new Error('handler-boom');
      },
      onRejected,
      onError,
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });

    await consumer.start([ref]);
    await repo.emit(ref);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'handler-boom' }),
      expect.any(Object),
    );
    expect(await repo.committedCheckpoint(ref)).toBeUndefined();
    expect(consumer.health().errorCount).toBe(1);
  });

  it('serializes duplicate signals for the same space', async () => {
    const repo = new InMemoryPermissionedRepoPort({
      records: [aliceRecord],
      verification: 'verified',
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    let releaseFirst: (() => void) | undefined;
    const firstProjection = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let activeProjections = 0;
    let maximumConcurrency = 0;
    const serializedAccepted = vi.fn(async () => {
      activeProjections += 1;
      maximumConcurrency = Math.max(maximumConcurrency, activeProjections);
      if (serializedAccepted.mock.calls.length === 1) {
        await firstProjection;
      }
      activeProjections -= 1;
    });
    const consumer = new SpacesConsumer({
      groupDirectory: new StaticGroupDirectoryPort([
        { space: ref, members: [aliceDid] },
      ]),
      permissionedRepo: repo,
      onAccepted: serializedAccepted,
      onRejected,
      onError: vi.fn(),
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    await consumer.start([ref]);

    const first = repo.emit(ref);
    await vi.waitFor(() => {
      expect(serializedAccepted).toHaveBeenCalledTimes(1);
    });
    const duplicate = repo.emit(ref);
    await Promise.resolve();
    expect(serializedAccepted).toHaveBeenCalledTimes(1);

    releaseFirst?.();
    await Promise.all([first, duplicate]);

    expect(serializedAccepted).toHaveBeenCalledTimes(2);
    expect(maximumConcurrency).toBe(1);
  });

  it('routes public repo lifecycle events through the per-space queue', async () => {
    const repo = new InMemoryPermissionedRepoPort({
      records: [],
      verification: 'verified',
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    const sync = vi.spyOn(repo, 'sync');
    const consumer = new SpacesConsumer({
      groupDirectory: new StaticGroupDirectoryPort([
        { space: ref, members: [aliceDid] },
      ]),
      permissionedRepo: repo,
      onAccepted,
      onRejected,
      onError: vi.fn(),
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    await consumer.start([ref]);

    await consumer.handleRepoLifecycleEvent({
      kind: 'identity',
      sequence: 42,
      did: aliceDid,
      occurredAt: new Date('2026-05-11T12:01:00Z'),
      handle: 'alice.example',
    });

    expect(sync).toHaveBeenCalledWith({
      space: ref,
      hint: {
        space: ref,
        repoDid: aliceDid,
        receivedAt: new Date('2026-05-11T12:01:00Z'),
        repoLifecycle: {
          kind: 'identity',
          sequence: 42,
          did: aliceDid,
          occurredAt: new Date('2026-05-11T12:01:00Z'),
          handle: 'alice.example',
        },
      },
    });
  });

  it('propagates lifecycle sync failures after recording them', async () => {
    const repo = new InMemoryPermissionedRepoPort({
      records: [],
      verification: 'verified',
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    vi.spyOn(repo, 'sync').mockRejectedValueOnce(new Error('sync-failed'));
    const onError = vi.fn();
    const consumer = new SpacesConsumer({
      groupDirectory: new StaticGroupDirectoryPort([
        { space: ref, members: [aliceDid] },
      ]),
      permissionedRepo: repo,
      onAccepted,
      onRejected,
      onError,
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    await consumer.start([ref]);

    await expect(
      consumer.handleRepoLifecycleEvent({
        kind: 'identity',
        sequence: 43,
        did: aliceDid,
        occurredAt: new Date('2026-05-11T12:02:00Z'),
      }),
    ).rejects.toThrow('sync-failed');
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'sync-failed' }),
      { space: ref },
    );
  });

  it('propagates lifecycle projection failures without checkpointing', async () => {
    const repo = new InMemoryPermissionedRepoPort({
      records: [aliceRecord],
      verification: 'verified',
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    const consumer = new SpacesConsumer({
      groupDirectory: new StaticGroupDirectoryPort([
        { space: ref, members: [aliceDid] },
      ]),
      permissionedRepo: repo,
      onAccepted: async () => {
        throw new Error('projection-failed');
      },
      onRejected,
      onError: vi.fn(),
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    await consumer.start([ref]);

    await expect(
      consumer.handleRepoLifecycleEvent({
        kind: 'account',
        sequence: 44,
        did: aliceDid,
        occurredAt: new Date('2026-05-11T12:03:00Z'),
        active: true,
      }),
    ).rejects.toThrow('projection-failed');
    await expect(repo.committedCheckpoint(ref)).resolves.toBeUndefined();
  });
});
