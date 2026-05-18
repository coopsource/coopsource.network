import type { DID } from '@coopsource/common';
import { spaceRefKey, type MembershipCursor, type MembershipSnapshotId, type SpaceRef } from './types.js';

export type MembershipConsistency = 'projection-ok' | 'strict';

export interface MembershipDecision {
  readonly ok: boolean;
  readonly isMember: boolean;
  readonly snapshotId?: MembershipSnapshotId;
  readonly sourceRevision?: string;
  readonly stale?: boolean;
  readonly reason?: 'not-found' | 'stale' | 'unavailable' | 'invalid-space';
}

export interface MembershipSnapshotPage {
  readonly members: ReadonlyArray<DID>;
  readonly cursor?: MembershipCursor;
  readonly snapshotId?: MembershipSnapshotId;
  readonly sourceRevision?: string;
  readonly stale?: boolean;
}

export interface GroupAuthorityPort {
  isMember(args: {
    readonly space: SpaceRef;
    readonly did: DID;
    readonly consistency: MembershipConsistency;
  }): Promise<MembershipDecision>;

  resolveMembership(args: {
    readonly space: SpaceRef;
    readonly cursor?: MembershipCursor;
    readonly consistency: MembershipConsistency;
  }): Promise<MembershipSnapshotPage>;
}

export class DenyAllGroupAuthorityPort implements GroupAuthorityPort {
  async isMember(_args: {
    readonly space: SpaceRef;
    readonly did: DID;
    readonly consistency: MembershipConsistency;
  }): Promise<MembershipDecision> {
    return { ok: true, isMember: false };
  }

  async resolveMembership(_args: {
    readonly space: SpaceRef;
    readonly cursor?: MembershipCursor;
    readonly consistency: MembershipConsistency;
  }): Promise<MembershipSnapshotPage> {
    return { members: [] };
  }
}

export class StaticGroupAuthorityPort implements GroupAuthorityPort {
  private readonly membersBySpace = new Map<string, ReadonlyArray<DID>>();
  private readonly pageSize: number;

  constructor(
    entries: ReadonlyArray<{ readonly space: SpaceRef; readonly members: ReadonlyArray<DID> }> = [],
    options: { readonly pageSize?: number } = {},
  ) {
    this.pageSize = options.pageSize ?? Number.POSITIVE_INFINITY;
    for (const entry of entries) {
      this.membersBySpace.set(spaceRefKey(entry.space), [...entry.members]);
    }
  }

  async isMember(args: {
    readonly space: SpaceRef;
    readonly did: DID;
    readonly consistency: MembershipConsistency;
  }): Promise<MembershipDecision> {
    const members = this.membersBySpace.get(spaceRefKey(args.space)) ?? [];
    return {
      ok: true,
      isMember: members.includes(args.did),
      snapshotId: this.snapshotId(args.space),
      stale: false,
    };
  }

  async resolveMembership(args: {
    readonly space: SpaceRef;
    readonly cursor?: MembershipCursor;
    readonly consistency: MembershipConsistency;
  }): Promise<MembershipSnapshotPage> {
    const members = this.membersBySpace.get(spaceRefKey(args.space)) ?? [];
    const offset = args.cursor ? Number.parseInt(args.cursor, 10) : 0;
    const page = members.slice(offset, offset + this.pageSize);
    const nextOffset = offset + page.length;
    return {
      members: page,
      cursor: nextOffset < members.length ? this.cursor(String(nextOffset)) : undefined,
      snapshotId: this.snapshotId(args.space),
      stale: false,
    };
  }

  private cursor(value: string): MembershipCursor {
    return value as MembershipCursor;
  }

  private snapshotId(space: SpaceRef): MembershipSnapshotId {
    return `static:${spaceRefKey(space)}` as MembershipSnapshotId;
  }
}
