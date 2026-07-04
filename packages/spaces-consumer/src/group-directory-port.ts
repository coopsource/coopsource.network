import type { DID } from '@coopsource/common';
import {
  spaceRefKey,
  type DirectSpaceMember,
  type MembershipCursor,
  type MembershipSnapshotId,
  type ResolvedMembers,
  type ResolvedSpaceMember,
  type SpaceMemberRef,
  type SpaceRef,
  type UnknownLexiconObject,
} from './types.js';

export type MembershipConsistency = 'projection-ok' | 'strict';

export interface SpaceConfigResult {
  readonly ok: boolean;
  readonly space: SpaceRef;
  readonly config?: UnknownLexiconObject;
  readonly sourceRevision?: string;
  readonly stale?: boolean;
  readonly reason?: 'not-found' | 'stale' | 'unavailable' | 'invalid-space';
}

export interface SpaceListPage {
  readonly spaces: ReadonlyArray<SpaceRef>;
  readonly cursor?: MembershipCursor;
  readonly sourceRevision?: string;
  readonly stale?: boolean;
}

export interface GroupDirectoryPort {
  listSpaces(args: {
    readonly arbiterDid: DID;
    readonly cursor?: MembershipCursor;
    readonly consistency: MembershipConsistency;
  }): Promise<SpaceListPage>;

  getSpaceConfig(args: SpaceRef & {
    readonly consistency: MembershipConsistency;
  }): Promise<SpaceConfigResult>;

  getDirectSpaceMembers(args: SpaceRef & {
    readonly consistency: MembershipConsistency;
  }): Promise<ReadonlyArray<DirectSpaceMember>>;

  resolveSpaceMembers(args: SpaceRef & {
    readonly consistency: MembershipConsistency;
    readonly resolverDepth?: number;
  }): Promise<ResolvedMembers>;
}

export class DenyAllGroupDirectoryPort implements GroupDirectoryPort {
  async listSpaces(_args: {
    readonly arbiterDid: DID;
    readonly cursor?: MembershipCursor;
    readonly consistency: MembershipConsistency;
  }): Promise<SpaceListPage> {
    return { spaces: [] };
  }

  async getSpaceConfig(args: SpaceRef & {
    readonly consistency: MembershipConsistency;
  }): Promise<SpaceConfigResult> {
    return { ok: false, space: args, reason: 'not-found' };
  }

  async getDirectSpaceMembers(_args: SpaceRef & {
    readonly consistency: MembershipConsistency;
  }): Promise<ReadonlyArray<DirectSpaceMember>> {
    return [];
  }

  async resolveSpaceMembers(args: SpaceRef & {
    readonly consistency: MembershipConsistency;
    readonly resolverDepth?: number;
  }): Promise<ResolvedMembers> {
    return emptyResolvedMembers(args, args.resolverDepth ?? 0);
  }
}

export class StaticGroupDirectoryPort implements GroupDirectoryPort {
  private readonly directMembersBySpace = new Map<string, ReadonlyArray<DirectSpaceMember>>();
  private readonly spacesByArbiter = new Map<DID, Map<string, SpaceRef>>();
  private readonly configsBySpace = new Map<string, UnknownLexiconObject>();

  constructor(
    entries: ReadonlyArray<{
      readonly space: SpaceRef;
      readonly members: ReadonlyArray<DID | SpaceMemberRef | DirectSpaceMember>;
      readonly config?: UnknownLexiconObject;
    }> = [],
  ) {
    for (const entry of entries) {
      this.addSpace(entry.space, entry.config);
      this.directMembersBySpace.set(
        spaceRefKey(entry.space),
        entry.members.map((member) => toDirectSpaceMember(member)),
      );
    }
  }

  async listSpaces(args: {
    readonly arbiterDid: DID;
    readonly cursor?: MembershipCursor;
    readonly consistency: MembershipConsistency;
  }): Promise<SpaceListPage> {
    return { spaces: [...(this.spacesByArbiter.get(args.arbiterDid)?.values() ?? [])] };
  }

  async getSpaceConfig(args: SpaceRef & {
    readonly consistency: MembershipConsistency;
  }): Promise<SpaceConfigResult> {
    const key = spaceRefKey(args);
    const space = this.spacesByArbiter.get(args.arbiterDid)?.get(key);
    if (!space) {
      return { ok: false, space: args, reason: 'not-found' };
    }
    return {
      ok: true,
      space,
      config: this.configsBySpace.get(key) ?? {},
      stale: false,
      sourceRevision: 'static',
    };
  }

  async getDirectSpaceMembers(args: SpaceRef & {
    readonly consistency: MembershipConsistency;
  }): Promise<ReadonlyArray<DirectSpaceMember>> {
    return this.directMembersBySpace.get(spaceRefKey(args)) ?? [];
  }

  async resolveSpaceMembers(args: SpaceRef & {
    readonly consistency: MembershipConsistency;
    readonly resolverDepth?: number;
  }): Promise<ResolvedMembers> {
    const maxDepth = Math.max(0, args.resolverDepth ?? 8);
    const result = await this.resolveSpace(args, args, maxDepth, [], new Set<string>());
    const snapshotId = `static:${spaceRefKey(args)}` as MembershipSnapshotId;
    return { ...result, snapshotId, sourceRevision: 'static' };
  }

  private async resolveSpace(
    root: SpaceRef,
    space: SpaceRef,
    remainingDepth: number,
    via: ReadonlyArray<SpaceRef>,
    visited: Set<string>,
  ): Promise<ResolvedMembers> {
    const key = spaceRefKey(space);
    if (visited.has(key)) {
      return {
        ...emptyResolvedMembers(root, remainingDepth),
        ok: false,
        partial: true,
        missingSpaces: [{ space, reason: 'cycle' }],
      };
    }

    const directMembers = this.directMembersBySpace.get(key);
    if (!directMembers) {
      return {
        ...emptyResolvedMembers(root, remainingDepth),
        ok: false,
        partial: true,
        missingSpaces: [{ space, reason: 'not-found' }],
      };
    }

    const nextVisited = new Set(visited);
    nextVisited.add(key);
    const resolved: ResolvedSpaceMember[] = [];
    const missingSpaces = [];

    for (const directMember of directMembers) {
      if (directMember.member.kind === 'did') {
        resolved.push({
          did: directMember.member.did,
          via: [...via, space],
          directMember: directMember.member,
          access: directMember.access,
          resolverDepth: via.length,
        });
        continue;
      }

      const memberSpace = spaceMemberToSpaceRef(space, directMember.member);
      if (!memberSpace) {
        continue;
      }

      if (remainingDepth <= 0) {
        missingSpaces.push({ space: memberSpace, reason: 'depth-limit' as const });
        continue;
      }

      const nested = await this.resolveSpace(
        root,
        memberSpace,
        remainingDepth - 1,
        [...via, space],
        nextVisited,
      );
      resolved.push(...nested.members);
      missingSpaces.push(...nested.missingSpaces);
    }

    return {
      ok: missingSpaces.length === 0,
      directMembers: via.length === 0 ? directMembers : [],
      members: dedupeResolvedMembers(resolved),
      missingSpaces,
      partial: missingSpaces.length > 0,
      stale: false,
      resolverDepth: remainingDepth,
    };
  }

  private addSpace(space: SpaceRef, config: UnknownLexiconObject | undefined): void {
    const key = spaceRefKey(space);
    const spaces = this.spacesByArbiter.get(space.arbiterDid) ?? new Map<string, SpaceRef>();
    spaces.set(key, space);
    this.spacesByArbiter.set(space.arbiterDid, spaces);
    if (config) {
      this.configsBySpace.set(key, config);
    }
  }
}

function toDirectSpaceMember(member: DID | SpaceMemberRef | DirectSpaceMember): DirectSpaceMember {
  if (typeof member === 'string') {
    return { member: { kind: 'did', did: member } };
  }
  if ('member' in member) {
    return member;
  }
  return { member };
}

function spaceMemberToSpaceRef(currentSpace: SpaceRef, member: SpaceMemberRef): SpaceRef | null {
  if (member.kind === 'did') return null;
  if (member.kind === 'localSpace') {
    return {
      arbiterDid: currentSpace.arbiterDid,
      spaceKey: member.spaceKey,
      expectedSpaceType: member.expectedSpaceType,
    };
  }
  return {
    arbiterDid: member.arbiterDid,
    spaceKey: member.spaceKey,
    expectedSpaceType: member.expectedSpaceType,
  };
}

function dedupeResolvedMembers(members: ReadonlyArray<ResolvedSpaceMember>): ReadonlyArray<ResolvedSpaceMember> {
  const byDid = new Map<DID, ResolvedSpaceMember>();
  for (const member of members) {
    if (!byDid.has(member.did)) {
      byDid.set(member.did, member);
    }
  }
  return [...byDid.values()];
}

function emptyResolvedMembers(space: SpaceRef, resolverDepth: number): ResolvedMembers {
  return {
    ok: true,
    directMembers: [],
    members: [],
    missingSpaces: [],
    partial: false,
    stale: false,
    resolverDepth,
    snapshotId: `empty:${spaceRefKey(space)}` as MembershipSnapshotId,
  };
}
