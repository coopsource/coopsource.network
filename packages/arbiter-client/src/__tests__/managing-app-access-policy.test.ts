import { describe, expect, it } from 'vitest';
import type { DID } from '@coopsource/common';
import {
  DenyAllGroupDirectoryPort,
  StaticGroupDirectoryPort,
  type ResolvedMembers,
  type SpaceRef,
} from '@coopsource/spaces-consumer';
import {
  CsnGroupDirectoryManagingAppAccessPolicy,
  membersSpace,
  roleSpace,
} from '../index.js';

const cooperativeDid = 'did:plc:coop' as DID;
const aliceDid = 'did:plc:alice' as DID;
const bobDid = 'did:plc:bob' as DID;

describe('CsnGroupDirectoryManagingAppAccessPolicy', () => {
  it('authorizes only users in the strict resolved CSN space', async () => {
    const members = membersSpace(cooperativeDid);
    const board = roleSpace(cooperativeDid, 'board');
    const workers = roleSpace(cooperativeDid, 'classes/worker');
    const directory = new StaticGroupDirectoryPort([
      { space: members, members: [aliceDid, bobDid] },
      { space: board, members: [aliceDid] },
      { space: workers, members: [bobDid] },
    ]);
    const policy = new CsnGroupDirectoryManagingAppAccessPolicy(directory);

    await expect(
      policy.checkUserAccess({ space: members, userDid: bobDid }),
    ).resolves.toMatchObject({ authorized: true });
    await expect(
      policy.checkUserAccess({ space: board, userDid: aliceDid }),
    ).resolves.toMatchObject({ authorized: true });
    await expect(
      policy.checkUserAccess({ space: board, userDid: bobDid }),
    ).resolves.toEqual({ authorized: false, reason: 'not-member' });
    await expect(
      policy.checkUserAccess({ space: workers, userDid: bobDid }),
    ).resolves.toMatchObject({ authorized: true });
  });

  it('denies stale, partial, failed, and throwing directory results', async () => {
    const space = membersSpace(cooperativeDid);
    const cases: ReadonlyArray<ResolvedMembers | Error> = [
      resolvedResult(space, { stale: true }),
      resolvedResult(space, { partial: true }),
      resolvedResult(space, { ok: false }),
      new Error('directory unavailable'),
    ];

    for (const result of cases) {
      const policy = new CsnGroupDirectoryManagingAppAccessPolicy(
        new FixedResolvedDirectory(result),
      );
      await expect(
        policy.checkUserAccess({ space, userDid: aliceDid }),
      ).resolves.toEqual({
        authorized: false,
        reason: 'policy-unavailable',
      });
    }
  });

  it('denies non-CSN spaces without consulting the directory', async () => {
    let calls = 0;
    const directory = new FixedResolvedDirectory(
      resolvedResult(membersSpace(cooperativeDid)),
      () => {
        calls += 1;
      },
    );
    const policy = new CsnGroupDirectoryManagingAppAccessPolicy(directory);

    await expect(
      policy.checkUserAccess({
        space: {
          arbiterDid: cooperativeDid,
          spaceKey: 'members',
          expectedSpaceType: 'example.other.space',
        },
        userDid: aliceDid,
      }),
    ).resolves.toEqual({
      authorized: false,
      reason: 'unsupported-space',
    });
    expect(calls).toBe(0);
  });
});

class FixedResolvedDirectory extends DenyAllGroupDirectoryPort {
  constructor(
    private readonly result: ResolvedMembers | Error,
    private readonly beforeResolve?: () => void,
  ) {
    super();
  }

  override async resolveSpaceMembers(): Promise<ResolvedMembers> {
    await Promise.resolve();
    this.beforeResolve?.();
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

function resolvedResult(
  _space: SpaceRef,
  overrides: Partial<ResolvedMembers> = {},
): ResolvedMembers {
  const directMember = { kind: 'did', did: aliceDid } as const;
  return {
    ok: true,
    directMembers: [{ member: directMember }],
    members: [
      {
        did: aliceDid,
        via: [],
        directMember,
        resolverDepth: 0,
      },
    ],
    missingSpaces: [],
    partial: false,
    stale: false,
    resolverDepth: 0,
    sourceRevision: 'directory-rev-1',
    ...overrides,
  };
}
