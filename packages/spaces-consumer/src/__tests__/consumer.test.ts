import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpacesConsumer, type RejectedPermissionedRecord } from '../consumer.js';
import { StaticGroupAuthorityPort, type GroupAuthorityPort } from '../group-authority-port.js';
import { InMemoryPermissionedRepoPort } from '../permissioned-repo-port.js';
import type { SpaceRef, VerifiedPermissionedRecord } from '../types.js';
import { buildVerifiedRecord, fakeDid } from './helpers/factories.js';

const ref: SpaceRef = { arbiter: fakeDid('did:plc:coop'), type: 'X', skey: 'members' };
const aliceDid = fakeDid('did:plc:alice');
const eveDid = fakeDid('did:plc:eve');
const aliceRecord = buildVerifiedRecord({ space: ref, authorDid: aliceDid, rkey: 'r1', sourceRevision: '1' });
const eveRecord = buildVerifiedRecord({ space: ref, authorDid: eveDid, rkey: 'r2', sourceRevision: '2' });

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
      groupAuthority: new StaticGroupAuthorityPort([{ space: ref, members: [aliceDid] }]),
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
      groupAuthority: new StaticGroupAuthorityPort([{ space: ref, members: [aliceDid] }]),
      permissionedRepo: repo,
      onAccepted,
      onRejected,
      onError: vi.fn(),
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });

    await consumer.start([ref]);
    await repo.emit(ref);

    expect(onAccepted).not.toHaveBeenCalled();
    expect(onRejected).toHaveBeenCalledWith({ record: eveRecord, reason: 'not-member' });
    expect(await repo.committedCheckpoint(ref)).toBe('2');
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
      groupAuthority: new StaticGroupAuthorityPort([{ space: ref, members: [aliceDid] }]),
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

  it('fails closed and does not checkpoint stale strict membership decisions', async () => {
    const repo = new InMemoryPermissionedRepoPort({
      records: [aliceRecord],
      verification: 'verified',
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    const staleAuthority: GroupAuthorityPort = {
      isMember: async () => ({ ok: true, isMember: true, stale: true }),
      resolveMembership: async () => ({ members: [], stale: true }),
    };
    const onError = vi.fn();
    const consumer = new SpacesConsumer({
      groupAuthority: staleAuthority,
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
  });

  it('does not checkpoint when onAccepted throws', async () => {
    const repo = new InMemoryPermissionedRepoPort({
      records: [aliceRecord],
      verification: 'verified',
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    const onError = vi.fn();
    const consumer = new SpacesConsumer({
      groupAuthority: new StaticGroupAuthorityPort([{ space: ref, members: [aliceDid] }]),
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

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'handler-boom' }), expect.any(Object));
    expect(await repo.committedCheckpoint(ref)).toBeUndefined();
    expect(consumer.health().errorCount).toBe(1);
  });
});
