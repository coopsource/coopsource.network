import { describe, expect, it, vi } from 'vitest';
import { InMemoryPermissionedRepoPort } from '../permissioned-repo-port.js';
import type { SpaceRef } from '../types.js';
import { buildVerifiedRecord, fakeDid } from './helpers/factories.js';

const ref: SpaceRef = { arbiterDid: fakeDid('did:plc:coop'), spaceKey: 'members', expectedSpaceType: 'X' };

describe('InMemoryPermissionedRepoPort', () => {
  it('watches spaces and emits stable change hints', async () => {
    const port = new InMemoryPermissionedRepoPort({
      verification: 'verified',
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    const onChange = vi.fn();

    const handle = await port.watch({ spaces: [ref], onChange });
    await port.emit(ref);
    expect(onChange).toHaveBeenCalledWith({ space: ref, receivedAt: new Date('2026-05-11T12:00:00Z') });

    await handle.close();
    await port.emit(ref);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('returns verified records with structured locations and opaque checkpoints', async () => {
    const record = buildVerifiedRecord({
      space: ref,
      authorDid: fakeDid('did:plc:alice'),
      sourceRevision: '3',
    });
    const port = new InMemoryPermissionedRepoPort({
      records: [record],
      verification: 'verified',
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });

    const changes = await port.sync({ space: ref });

    expect(changes.verification).toBe('verified');
    expect(changes.records[0]).toMatchObject({
      location: {
        space: ref,
        authorDid: fakeDid('did:plc:alice'),
        collection: 'network.coopsource.governance.vote',
        rkey: 'rk',
      },
    });
    expect('uri' in (changes.records[0] as object)).toBe(false);
    expect(changes.checkpoint).toBe('3');
  });

  it('fails closed without returning records or checkpoints', async () => {
    const port = new InMemoryPermissionedRepoPort({
      records: [buildVerifiedRecord({ space: ref, authorDid: fakeDid('did:plc:alice') })],
      verification: 'failed-closed',
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });

    await expect(port.sync({ space: ref })).resolves.toEqual({
      space: ref,
      records: [],
      verification: 'failed-closed',
    });
  });
});
