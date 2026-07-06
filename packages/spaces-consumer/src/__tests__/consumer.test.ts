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
import { buildVerifiedRecord, fakeDid } from './helpers/factories.js';

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
});
