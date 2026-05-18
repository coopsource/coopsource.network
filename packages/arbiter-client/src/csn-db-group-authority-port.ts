import type { DID } from '@coopsource/common';
import type { Database } from '@coopsource/db';
import type {
  GroupAuthorityPort,
  MembershipConsistency,
  MembershipCursor,
  MembershipDecision,
  MembershipSnapshotId,
  MembershipSnapshotPage,
  SpaceRef,
} from '@coopsource/spaces-consumer';
import type { Kysely } from 'kysely';
import { parseCsnSpace, type CsnSpace } from './space-ref.js';

const DEFAULT_PAGE_SIZE = 500;
const CURSOR_PREFIX = 'csn-db-v1';

interface MembershipCursorPayload {
  readonly indexedAt: Date;
  readonly membershipId: string;
}

interface MemberRow {
  readonly id: string;
  readonly member_did: string;
  readonly indexed_at: Date | string;
}

interface RoleMemberRow extends MemberRow {
  readonly role_indexed_at: Date | string;
}

export interface CsnDbGroupAuthorityPortOptions {
  readonly pageSize?: number;
}

export class CsnDbGroupAuthorityPort implements GroupAuthorityPort {
  private readonly pageSize: number;

  constructor(
    private readonly db: Kysely<Database>,
    options: CsnDbGroupAuthorityPortOptions = {},
  ) {
    this.pageSize = Math.max(1, options.pageSize ?? DEFAULT_PAGE_SIZE);
  }

  async isMember(args: {
    readonly space: SpaceRef;
    readonly did: DID;
    readonly consistency: MembershipConsistency;
  }): Promise<MembershipDecision> {
    const space = parseCsnSpace(args.space);
    if (!space) {
      return { ok: false, isMember: false, reason: 'invalid-space', stale: true };
    }

    const row =
      space.kind === 'members'
        ? await this.findActiveMember(space.cooperativeDid, args.did)
        : await this.findActiveRoleMember(space.cooperativeDid, args.did, space.role);

    if (!row) {
      return { ok: true, isMember: false, reason: 'not-found', stale: false };
    }

    const sourceRevision = rowSourceRevision(row);
    return {
      ok: true,
      isMember: true,
      sourceRevision,
      snapshotId: snapshotId(args.space, sourceRevision),
      stale: false,
    };
  }

  async resolveMembership(args: {
    readonly space: SpaceRef;
    readonly cursor?: MembershipCursor;
    readonly consistency: MembershipConsistency;
  }): Promise<MembershipSnapshotPage> {
    const space = parseCsnSpace(args.space);
    if (!space) {
      return { members: [], stale: true };
    }

    const cursor = decodeCursor(args.cursor);
    if (cursor === 'invalid') {
      return { members: [], stale: true };
    }

    const rows = await this.loadMemberPage(space, cursor);
    const pageRows = rows.slice(0, this.pageSize);
    const lastRow = pageRows.at(-1);
    const sourceRevision = rowsSourceRevision(pageRows);

    return {
      members: pageRows.map((row) => row.member_did as DID),
      cursor: rows.length > this.pageSize && lastRow ? encodeCursor(lastRow) : undefined,
      sourceRevision,
      snapshotId: snapshotId(args.space, sourceRevision),
      stale: false,
    };
  }

  private async findActiveMember(cooperativeDid: DID, memberDid: DID): Promise<MemberRow | undefined> {
    return this.activeMemberBaseQuery(cooperativeDid)
      .where('membership.member_did', '=', memberDid)
      .select(['membership.id', 'membership.member_did', 'membership.indexed_at'])
      .executeTakeFirst();
  }

  private async findActiveRoleMember(
    cooperativeDid: DID,
    memberDid: DID,
    role: string,
  ): Promise<RoleMemberRow | undefined> {
    return this.activeRoleMemberBaseQuery(cooperativeDid, role)
      .where('membership.member_did', '=', memberDid)
      .select([
        'membership.id',
        'membership.member_did',
        'membership.indexed_at',
        'membership_role.indexed_at as role_indexed_at',
      ])
      .executeTakeFirst();
  }

  private async loadMemberPage(
    space: CsnSpace,
    cursor: MembershipCursorPayload | null,
  ): Promise<ReadonlyArray<MemberRow | RoleMemberRow>> {
    if (space.kind === 'members') {
      let query = this.activeMemberBaseQuery(space.cooperativeDid).select([
        'membership.id',
        'membership.member_did',
        'membership.indexed_at',
      ]);
      if (cursor) {
        query = query.where((eb) =>
          eb.or([
            eb('membership.indexed_at', '>', cursor.indexedAt),
            eb.and([
              eb('membership.indexed_at', '=', cursor.indexedAt),
              eb('membership.id', '>', cursor.membershipId),
            ]),
          ]),
        );
      }
      return query
        .orderBy('membership.indexed_at', 'asc')
        .orderBy('membership.id', 'asc')
        .limit(this.pageSize + 1)
        .execute();
    }

    let query = this.activeRoleMemberBaseQuery(space.cooperativeDid, space.role).select([
      'membership.id',
      'membership.member_did',
      'membership.indexed_at',
      'membership_role.indexed_at as role_indexed_at',
    ]);
    if (cursor) {
      query = query.where((eb) =>
        eb.or([
          eb('membership.indexed_at', '>', cursor.indexedAt),
          eb.and([
            eb('membership.indexed_at', '=', cursor.indexedAt),
            eb('membership.id', '>', cursor.membershipId),
          ]),
        ]),
      );
    }
    return query
      .orderBy('membership.indexed_at', 'asc')
      .orderBy('membership.id', 'asc')
      .limit(this.pageSize + 1)
      .execute();
  }

  private activeMemberBaseQuery(cooperativeDid: DID) {
    return this.db
      .selectFrom('membership')
      .where('membership.cooperative_did', '=', cooperativeDid)
      .where('membership.status', '=', 'active')
      .where('membership.invalidated_at', 'is', null);
  }

  private activeRoleMemberBaseQuery(cooperativeDid: DID, role: string) {
    return this.activeMemberBaseQuery(cooperativeDid)
      .innerJoin('membership_role', 'membership_role.membership_id', 'membership.id')
      .where('membership_role.role', '=', role);
  }
}

function encodeCursor(row: MemberRow): MembershipCursor {
  return [
    CURSOR_PREFIX,
    encodeURIComponent(toIso(row.indexed_at)),
    encodeURIComponent(row.id),
  ].join('|') as MembershipCursor;
}

function decodeCursor(cursor: MembershipCursor | undefined): MembershipCursorPayload | null | 'invalid' {
  if (!cursor) return null;

  const [prefix, indexedAt, membershipId] = cursor.split('|');
  if (prefix !== CURSOR_PREFIX || !indexedAt || !membershipId) {
    return 'invalid';
  }

  const date = new Date(decodeURIComponent(indexedAt));
  if (Number.isNaN(date.valueOf())) {
    return 'invalid';
  }

  return {
    indexedAt: date,
    membershipId: decodeURIComponent(membershipId),
  };
}

function rowsSourceRevision(rows: ReadonlyArray<MemberRow | RoleMemberRow>): string | undefined {
  const revisions = rows.flatMap((row) => rowRevisionDates(row));
  return latestIso(revisions);
}

function rowSourceRevision(row: MemberRow | RoleMemberRow): string {
  return latestIso(rowRevisionDates(row)) ?? toIso(row.indexed_at);
}

function rowRevisionDates(row: MemberRow | RoleMemberRow): ReadonlyArray<Date | string> {
  return 'role_indexed_at' in row ? [row.indexed_at, row.role_indexed_at] : [row.indexed_at];
}

function latestIso(values: ReadonlyArray<Date | string>): string | undefined {
  let latest: Date | null = null;
  for (const value of values) {
    const date = value instanceof Date ? value : new Date(value);
    if (!latest || date.valueOf() > latest.valueOf()) {
      latest = date;
    }
  }
  return latest?.toISOString();
}

function snapshotId(space: SpaceRef, sourceRevision: string | undefined): MembershipSnapshotId {
  return `csn-db:${space.arbiter}|${space.type}|${space.skey}@${sourceRevision ?? 'empty'}` as MembershipSnapshotId;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
