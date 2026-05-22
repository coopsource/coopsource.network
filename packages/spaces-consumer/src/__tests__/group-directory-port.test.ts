import { describe, expect, it } from 'vitest';
import { DenyAllGroupDirectoryPort, StaticGroupDirectoryPort } from '../group-directory-port.js';
import type { SpaceRef } from '../types.js';
import { fakeDid } from './helpers/factories.js';

const ref: SpaceRef = { arbiterDid: fakeDid('did:plc:coop'), spaceKey: 'members', expectedSpaceType: 'X' };
const boardRef: SpaceRef = { ...ref, spaceKey: 'roles/board' };
const remoteRef: SpaceRef = { arbiterDid: fakeDid('did:plc:remote'), spaceKey: 'members', expectedSpaceType: 'X' };

describe('DenyAllGroupDirectoryPort', () => {
  it('fails closed without reporting stale data', async () => {
    const port = new DenyAllGroupDirectoryPort();
    await expect(
      port.getDirectSpaceMembers({ ...ref, consistency: 'strict' }),
    ).resolves.toEqual([]);
    await expect(
      port.resolveSpaceMembers({ ...ref, consistency: 'strict' }),
    ).resolves.toMatchObject({ ok: true, members: [], stale: false });
  });
});

describe('StaticGroupDirectoryPort', () => {
  it('lists spaces and resolves direct DID members', async () => {
    const port = new StaticGroupDirectoryPort([
      { space: ref, members: [fakeDid('did:plc:a'), fakeDid('did:plc:b')] },
    ]);

    await expect(port.listSpaces({ arbiterDid: ref.arbiterDid, consistency: 'strict' }))
      .resolves.toMatchObject({ spaces: [ref] });

    const resolved = await port.resolveSpaceMembers({ ...ref, consistency: 'strict' });
    expect(resolved.ok).toBe(true);
    expect(resolved.directMembers).toHaveLength(2);
    expect(resolved.members.map((member) => member.did)).toEqual([fakeDid('did:plc:a'), fakeDid('did:plc:b')]);
  });

  it('resolves local-space and remote-space members with resolver depth metadata', async () => {
    const port = new StaticGroupDirectoryPort([
      {
        space: ref,
        members: [
          { kind: 'localSpace', spaceKey: boardRef.spaceKey, expectedSpaceType: boardRef.expectedSpaceType },
          {
            kind: 'remoteSpace',
            arbiterDid: remoteRef.arbiterDid,
            spaceKey: remoteRef.spaceKey,
            expectedSpaceType: remoteRef.expectedSpaceType,
          },
        ],
      },
      { space: boardRef, members: [fakeDid('did:plc:local-board')] },
      { space: remoteRef, members: [fakeDid('did:plc:remote-member')] },
    ]);

    const resolved = await port.resolveSpaceMembers({ ...ref, consistency: 'strict', resolverDepth: 4 });
    expect(resolved.ok).toBe(true);
    expect(resolved.members.map((member) => member.did)).toEqual([
      fakeDid('did:plc:local-board'),
      fakeDid('did:plc:remote-member'),
    ]);
    expect(resolved.members.every((member) => member.resolverDepth === 1)).toBe(true);
  });

  it('marks missing spaces, depth limits, and cycles as partial', async () => {
    const missingRef: SpaceRef = { ...ref, spaceKey: 'roles/missing' };
    const port = new StaticGroupDirectoryPort([
      {
        space: ref,
        members: [
          { kind: 'localSpace', spaceKey: missingRef.spaceKey, expectedSpaceType: missingRef.expectedSpaceType },
          { kind: 'localSpace', spaceKey: boardRef.spaceKey, expectedSpaceType: boardRef.expectedSpaceType },
        ],
      },
      { space: boardRef, members: [{ kind: 'localSpace', spaceKey: ref.spaceKey, expectedSpaceType: ref.expectedSpaceType }] },
    ]);

    const missing = await port.resolveSpaceMembers({ ...ref, consistency: 'strict', resolverDepth: 2 });
    expect(missing.ok).toBe(false);
    expect(missing.partial).toBe(true);
    expect(missing.missingSpaces.map((space) => space.reason)).toContain('not-found');
    expect(missing.missingSpaces.map((space) => space.reason)).toContain('cycle');

    const depthLimited = await port.resolveSpaceMembers({ ...ref, consistency: 'strict', resolverDepth: 0 });
    expect(depthLimited.ok).toBe(false);
    expect(depthLimited.missingSpaces.map((space) => space.reason)).toContain('depth-limit');
  });
});
