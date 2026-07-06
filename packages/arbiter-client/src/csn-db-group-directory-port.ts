import type { DID } from '@coopsource/common';
import type { Database } from '@coopsource/db';
import type {
  DirectSpaceMember,
  GroupDirectoryPort,
  MembershipConsistency,
  MembershipCursor,
  MembershipSnapshotId,
  ResolvedMembers,
  SpaceConfigResult,
  SpaceListPage,
  SpaceRef,
} from '@coopsource/spaces-consumer';
import type { Kysely } from 'kysely';
import {
  CLASS_SPACE_TYPE,
  MEMBERS_SPACE_TYPE,
  membersSpace,
  parseCsnSpace,
  roleSpace,
  type CsnSpace,
} from './space-ref.js';

const CURSOR_PREFIX = 'csn-db-spaces-v1';

interface MembershipCursorPayload {
  readonly indexedAt: Date;
  readonly id: string;
}

interface MemberRow {
  readonly id: string;
  readonly member_did: string;
  readonly indexed_at: Date | string;
}

interface RoleMemberRow extends MemberRow {
  readonly role_indexed_at: Date | string;
}

export interface CsnDbGroupDirectoryPortOptions {
  readonly pageSize?: number;
}

export class CsnDbGroupDirectoryPort implements GroupDirectoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly options: CsnDbGroupDirectoryPortOptions = {},
  ) {}

  async listSpaces(args: {
    readonly arbiterDid: DID;
    readonly cursor?: MembershipCursor;
    readonly consistency: MembershipConsistency;
  }): Promise<SpaceListPage> {
    const roles = await this.db
      .selectFrom('membership_role')
      .innerJoin('membership', 'membership.id', 'membership_role.membership_id')
      .where('membership.cooperative_did', '=', args.arbiterDid)
      .where('membership.status', '=', 'active')
      .where('membership.invalidated_at', 'is', null)
      .select('membership_role.role')
      .distinct()
      .orderBy('membership_role.role', 'asc')
      .execute();

    return {
      spaces: [
        membersSpace(args.arbiterDid),
        ...roles.map((row) => roleSpace(args.arbiterDid, row.role)),
      ],
      stale: false,
    };
  }

  async getSpaceConfig(
    args: SpaceRef & {
      readonly consistency: MembershipConsistency;
    },
  ): Promise<SpaceConfigResult> {
    const space = parseCsnSpace(args);
    if (!space) {
      return { ok: false, space: args, stale: true, reason: 'invalid-space' };
    }

    return {
      ok: true,
      space: args,
      config: {
        spaceType:
          space.kind === 'class'
            ? CLASS_SPACE_TYPE
            : (args.expectedSpaceType ?? MEMBERS_SPACE_TYPE),
        source: 'csn-db',
      },
      stale: false,
    };
  }

  async getDirectSpaceMembers(
    args: SpaceRef & {
      readonly consistency: MembershipConsistency;
    },
  ): Promise<ReadonlyArray<DirectSpaceMember>> {
    const space = parseCsnSpace(args);
    if (!space) return [];
    const { rows } = await this.loadMembers(space, args.consistency);
    return rows.map((row) => this.toDirectMember(row));
  }

  async resolveSpaceMembers(
    args: SpaceRef & {
      readonly consistency: MembershipConsistency;
      readonly resolverDepth?: number;
    },
  ): Promise<ResolvedMembers> {
    const space = parseCsnSpace(args);
    if (!space) {
      return {
        ok: false,
        directMembers: [],
        members: [],
        missingSpaces: [{ space: args, reason: 'invalid-space' }],
        partial: true,
        stale: true,
        resolverDepth: args.resolverDepth ?? 0,
      };
    }

    const { rows, truncated } = await this.loadMembers(space, args.consistency);
    const directMembers = rows.map((row) => this.toDirectMember(row));
    const sourceRevision = rowsSourceRevisionFromDirect(directMembers);
    return {
      ok: true,
      directMembers,
      members: directMembers.flatMap((member) =>
        member.member.kind === 'did'
          ? [
              {
                did: member.member.did,
                via: [args],
                directMember: member.member,
                access: member.access,
                resolverDepth: 0,
              },
            ]
          : [],
      ),
      missingSpaces: [],
      // A truncated projection-ok roster is an incomplete member list: mark it
      // partial so fail-closed consumers do not treat it as authoritative.
      partial: truncated,
      stale: false,
      resolverDepth: args.resolverDepth ?? 0,
      sourceRevision,
      snapshotId: snapshotId(args, sourceRevision),
    };
  }

  private toDirectMember(row: MemberRow | RoleMemberRow): DirectSpaceMember {
    return {
      member: { kind: 'did', did: row.member_did as DID },
      source: {
        adapter: 'csn-db',
        membershipId: row.id,
        indexedAt: toIso(row.indexed_at),
      },
    };
  }

  /**
   * Load a space's direct members. Strict reads are authoritative for the CSN DB
   * adapter and load the complete roster. Projection-ok reads are capped at
   * pageSize and fetch one extra row to detect truncation.
   */
  private async loadMembers(
    space: CsnSpace,
    consistency: MembershipConsistency,
  ): Promise<{
    rows: ReadonlyArray<MemberRow | RoleMemberRow>;
    truncated: boolean;
  }> {
    const cap = this.pageSize();
    let fetched: ReadonlyArray<MemberRow | RoleMemberRow>;
    if (space.kind === 'members') {
      const query = this.activeMemberBaseQuery(space.cooperativeDid)
        .select([
          'membership.id',
          'membership.member_did',
          'membership.indexed_at',
        ])
        .orderBy('membership.indexed_at', 'asc')
        .orderBy('membership.id', 'asc');
      fetched = await this.executeMembershipQuery(query, consistency, cap);
    } else if (space.kind === 'class') {
      const query = this.activeMemberBaseQuery(space.cooperativeDid)
        .where('membership.member_class', '=', space.memberClass)
        .select([
          'membership.id',
          'membership.member_did',
          'membership.indexed_at',
        ])
        .orderBy('membership.indexed_at', 'asc')
        .orderBy('membership.id', 'asc');
      fetched = await this.executeMembershipQuery(query, consistency, cap);
    } else {
      const query = this.activeRoleMemberBaseQuery(
        space.cooperativeDid,
        space.role,
      )
        .select([
          'membership.id',
          'membership.member_did',
          'membership.indexed_at',
          'membership_role.indexed_at as role_indexed_at',
        ])
        .orderBy('membership.indexed_at', 'asc')
        .orderBy('membership.id', 'asc');
      fetched = await this.executeMembershipQuery(query, consistency, cap);
    }
    const truncated = consistency !== 'strict' && fetched.length > cap;
    return { rows: truncated ? fetched.slice(0, cap) : fetched, truncated };
  }

  private async executeMembershipQuery<Row extends MemberRow | RoleMemberRow>(
    query: {
      limit(limit: number): { execute(): Promise<ReadonlyArray<Row>> };
      execute(): Promise<ReadonlyArray<Row>>;
    },
    consistency: MembershipConsistency,
    cap: number,
  ): Promise<ReadonlyArray<Row>> {
    if (consistency === 'strict') {
      return query.execute();
    }
    return query.limit(cap + 1).execute();
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
      .innerJoin(
        'membership_role',
        'membership_role.membership_id',
        'membership.id',
      )
      .where('membership_role.role', '=', role);
  }

  private pageSize(): number {
    return Math.max(1, this.options.pageSize ?? 5000);
  }
}

export function encodeMembershipCursor(row: {
  readonly indexed_at: Date | string;
  readonly id: string;
}): MembershipCursor {
  return [
    CURSOR_PREFIX,
    encodeURIComponent(toIso(row.indexed_at)),
    encodeURIComponent(row.id),
  ].join('|') as MembershipCursor;
}

export function decodeMembershipCursor(
  cursor: MembershipCursor | undefined,
): MembershipCursorPayload | null | 'invalid' {
  if (!cursor) return null;

  const [prefix, indexedAt, id] = cursor.split('|');
  if (prefix !== CURSOR_PREFIX || !indexedAt || !id) {
    return 'invalid';
  }

  const date = new Date(decodeURIComponent(indexedAt));
  if (Number.isNaN(date.valueOf())) {
    return 'invalid';
  }

  return {
    indexedAt: date,
    id: decodeURIComponent(id),
  };
}

function rowsSourceRevisionFromDirect(
  members: ReadonlyArray<DirectSpaceMember>,
): string | undefined {
  return latestIso(
    members.flatMap((member) => {
      const value = member.source?.indexedAt;
      return typeof value === 'string' ? [value] : [];
    }),
  );
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

function snapshotId(
  space: SpaceRef,
  sourceRevision: string | undefined,
): MembershipSnapshotId {
  return `csn-db:${space.arbiterDid}|${space.spaceKey}@${sourceRevision ?? 'empty'}` as MembershipSnapshotId;
}

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
