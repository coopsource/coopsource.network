import { AppError, type DID, type Permission } from '@coopsource/common';
import type { Database } from '@coopsource/db';
import { membersSpace } from '@coopsource/arbiter-client';
import type { GroupDirectoryPort } from '@coopsource/spaces-consumer';
import type { Kysely } from 'kysely';
import type { Page, PageParams } from '../lib/pagination.js';
import { decodeCursor, encodeCursor } from '../lib/pagination.js';
import { resolveRolePermissions } from './role-permissions.js';

export interface ActiveMembershipProjection {
  readonly membershipId: string;
  readonly cooperativeDid: string;
  readonly memberDid: string;
  readonly status: 'active';
  readonly roles: readonly string[];
  readonly joinedAt: Date | null;
}

export interface ActorMembershipProjection extends ActiveMembershipProjection {
  readonly displayName: string;
}

export interface MemberCooperativeSummary {
  readonly did: string;
  readonly handle: string | null;
  readonly displayName: string;
  readonly description: string | null;
  readonly website: string | null;
  readonly cooperativeType: string;
  readonly isNetwork: boolean;
  readonly status: 'active';
  readonly createdAt: string | null;
}

export interface ProjectedMemberCooperativesOptions {
  readonly isNetwork?: boolean;
  readonly anonDiscoverable?: boolean;
  readonly requireHandle?: boolean;
}

export interface ProjectedMembershipCountOptions {
  readonly status?: string;
  readonly includeInvalidated?: boolean;
}

export interface MemberDirectoryEntry {
  readonly did: string;
  readonly displayName: string;
  readonly status: string;
  readonly roles: readonly string[];
  readonly membershipId: string;
  readonly joinedAt: Date | null;
  readonly directoryVisible: boolean;
}

export interface ProjectedMembershipStatus {
  readonly membershipId: string;
  readonly status: string;
}

export type MembershipAuthorityFailureReason =
  | 'not-member'
  | 'partial'
  | 'stale'
  | 'unavailable';

export interface MembershipAuthorityFailure {
  readonly ok: false;
  readonly axis: 'spaces';
  readonly reason: MembershipAuthorityFailureReason;
  readonly message: string;
}

interface MembershipAuthoritySuccess {
  readonly ok: true;
}

export type ActiveMembershipResult =
  | {
      readonly ok: true;
      readonly membership: ActiveMembershipProjection;
    }
  | MembershipAuthorityFailure;

export type ActorMembershipResult =
  | {
      readonly ok: true;
      readonly membership: ActorMembershipProjection;
    }
  | MembershipAuthorityFailure;

export type PermissionCheckResult =
  | {
      readonly ok: true;
      readonly allowed: boolean;
    }
  | MembershipAuthorityFailure;

export type MemberCooperativesResult =
  | {
      readonly ok: true;
      readonly memberships: readonly MemberCooperativeSummary[];
    }
  | MembershipAuthorityFailure;

export type MemberDirectoryResult =
  | {
      readonly ok: true;
      readonly page: Page<MemberDirectoryEntry>;
    }
  | MembershipAuthorityFailure;

export type MemberLookupResult =
  | {
      readonly ok: true;
      readonly member: MemberDirectoryEntry | null;
    }
  | MembershipAuthorityFailure;

export type ActiveMemberCountResult =
  | {
      readonly ok: true;
      readonly count: number;
    }
  | MembershipAuthorityFailure;

interface CandidateMembershipRow {
  readonly id: string;
  readonly cooperative_did: string;
  readonly member_did: string;
  readonly joined_at: Date | null;
}

interface MemberDirectoryRow {
  readonly id: string;
  readonly member_did: string;
  readonly status: string;
  readonly joined_at: Date | null;
  readonly created_at: Date;
  readonly directory_visible: boolean;
  readonly display_name: string;
}

type ActiveMemberSetResult =
  | {
      readonly ok: true;
      readonly memberDids: ReadonlySet<string>;
    }
  | MembershipAuthorityFailure;

export class MembershipReadModel {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly groupDirectory: GroupDirectoryPort,
  ) {}

  async getPrimaryActorMembership(
    memberDid: DID,
  ): Promise<ActorMembershipProjection | null> {
    const result = await this.getPrimaryActorMembershipResult(memberDid);
    return result.ok ? result.membership : null;
  }

  async getPrimaryActorMembershipResult(
    memberDid: DID,
  ): Promise<ActorMembershipResult> {
    const entity = await this.db
      .selectFrom('entity')
      .where('did', '=', memberDid)
      .where('status', '=', 'active')
      .select(['did', 'display_name'])
      .executeTakeFirst();
    if (!entity) {
      return membershipAuthorityFailure(
        'not-member',
        'No active member entity',
      );
    }

    const candidate = await this.db
      .selectFrom('membership')
      .where('member_did', '=', memberDid)
      .where('status', '=', 'active')
      .where('invalidated_at', 'is', null)
      .select(['id', 'cooperative_did', 'member_did', 'joined_at'])
      .executeTakeFirst();
    if (!candidate) {
      return membershipAuthorityFailure('not-member', 'No active membership');
    }

    const active = await this.getActiveMembershipResult(
      candidate.cooperative_did as DID,
      memberDid,
    );
    if (!active.ok) return active;

    return {
      ok: true,
      membership: {
        ...active.membership,
        displayName: entity.display_name,
      },
    };
  }

  async getActiveMembership(
    cooperativeDid: DID,
    memberDid: DID,
  ): Promise<ActiveMembershipProjection | null> {
    const result = await this.getActiveMembershipResult(
      cooperativeDid,
      memberDid,
    );
    return result.ok ? result.membership : null;
  }

  async getActiveMembershipResult(
    cooperativeDid: DID,
    memberDid: DID,
  ): Promise<ActiveMembershipResult> {
    const authority = await this.resolveMemberAuthority(
      cooperativeDid,
      memberDid,
    );
    if (!authority.ok) return authority;

    const row = await this.loadActiveMembershipRow(cooperativeDid, memberDid);
    if (!row) {
      return membershipAuthorityFailure('not-member', 'No active membership');
    }

    return {
      ok: true,
      membership: {
        membershipId: row.id,
        cooperativeDid: row.cooperative_did,
        memberDid: row.member_did,
        status: 'active',
        roles: await this.loadRoles(row.id),
        joinedAt: row.joined_at,
      },
    };
  }

  async hasPermission(
    cooperativeDid: DID,
    memberDid: DID,
    permission: Permission,
  ): Promise<boolean> {
    const result = await this.hasPermissionResult(
      cooperativeDid,
      memberDid,
      permission,
    );
    return result.ok && result.allowed;
  }

  async hasPermissionResult(
    cooperativeDid: DID,
    memberDid: DID,
    permission: Permission,
  ): Promise<PermissionCheckResult> {
    const membershipResult = await this.getActiveMembershipResult(
      cooperativeDid,
      memberDid,
    );
    if (!membershipResult.ok) return membershipResult;

    const permissions = await resolveRolePermissions(
      this.db,
      cooperativeDid,
      membershipResult.membership.roles,
    );
    return {
      ok: true,
      allowed: permissions.has('*') || permissions.has(permission),
    };
  }

  async listMemberCooperatives(
    memberDid: DID,
  ): Promise<readonly MemberCooperativeSummary[]> {
    const result = await this.listMemberCooperativesResult(memberDid);
    return result.ok ? result.memberships : [];
  }

  async listMemberCooperativesResult(
    memberDid: DID,
  ): Promise<MemberCooperativesResult> {
    const rows = await this.db
      .selectFrom('membership')
      .innerJoin('entity', 'entity.did', 'membership.cooperative_did')
      .innerJoin(
        'cooperative_profile',
        'cooperative_profile.entity_did',
        'entity.did',
      )
      .where('membership.member_did', '=', memberDid)
      .where('membership.status', '=', 'active')
      .where('membership.invalidated_at', 'is', null)
      .select([
        'entity.did',
        'entity.handle',
        'entity.display_name',
        'entity.description',
        'cooperative_profile.is_network',
        'cooperative_profile.cooperative_type',
        'cooperative_profile.website',
        'membership.joined_at',
      ])
      .execute();

    const visibleRows: MemberCooperativeSummary[] = [];
    for (const row of rows) {
      const authority = await this.resolveMemberAuthority(
        row.did as DID,
        memberDid,
      );
      if (!authority.ok) {
        if (authority.reason === 'not-member') continue;
        return authority;
      }

      visibleRows.push({
        did: row.did,
        handle: row.handle,
        displayName: row.display_name,
        description: row.description,
        website: row.website,
        cooperativeType: row.cooperative_type,
        isNetwork: row.is_network,
        status: 'active',
        createdAt: row.joined_at ? row.joined_at.toISOString() : null,
      });
    }

    return { ok: true, memberships: visibleRows };
  }

  async listMembersResult(
    cooperativeDid: DID,
    params: PageParams,
    opts: { readonly status?: string } = {},
  ): Promise<MemberDirectoryResult> {
    const status = opts.status ?? 'active';
    const authority =
      status === 'active'
        ? await this.resolveActiveMemberSet(cooperativeDid)
        : undefined;
    if (authority && !authority.ok) return authority;

    const authorityDids = authority?.memberDids;
    if (authorityDids && authorityDids.size === 0) {
      return { ok: true, page: { items: [] } };
    }

    const limit = params.limit ?? 50;
    let query = this.db
      .selectFrom('membership')
      .innerJoin('entity', 'entity.did', 'membership.member_did')
      .where('membership.cooperative_did', '=', cooperativeDid)
      .where('membership.status', '=', status)
      .where('membership.invalidated_at', 'is', null)
      .select([
        'membership.id',
        'membership.member_did',
        'membership.status',
        'membership.joined_at',
        'membership.created_at',
        'membership.directory_visible',
        'entity.display_name',
      ])
      .orderBy('membership.created_at', 'desc')
      .orderBy('membership.id', 'desc')
      .limit(limit + 1);

    if (authorityDids) {
      query = query.where(
        'membership.member_did',
        'in',
        Array.from(authorityDids),
      );
    }

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('membership.created_at', '<', new Date(t)),
          eb.and([
            eb('membership.created_at', '=', new Date(t)),
            eb('membership.id', '<', i),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);
    const roleMap = await this.loadRoleMap(slice.map((row) => row.id));
    const items = slice.map((row) => this.toMemberDirectoryEntry(row, roleMap));
    const cursor =
      rows.length > limit
        ? encodeCursor(
            slice[slice.length - 1]!.created_at,
            slice[slice.length - 1]!.id,
          )
        : undefined;

    return { ok: true, page: { items, cursor } };
  }

  async getMemberResult(
    cooperativeDid: DID,
    memberDid: DID,
  ): Promise<MemberLookupResult> {
    const row = await this.loadMemberDirectoryRow(cooperativeDid, memberDid);
    if (!row) {
      return { ok: true, member: null };
    }

    if (row.status === 'active') {
      const authority = await this.resolveMemberAuthority(
        cooperativeDid,
        memberDid,
      );
      if (!authority.ok) return authority;
    }

    return {
      ok: true,
      member: this.toMemberDirectoryEntry(
        row,
        await this.loadRoleMap([row.id]),
      ),
    };
  }

  async countActiveMembersResult(
    cooperativeDid: DID,
  ): Promise<ActiveMemberCountResult> {
    const authority = await this.resolveActiveMemberSet(cooperativeDid);
    if (!authority.ok) return authority;

    return { ok: true, count: authority.memberDids.size };
  }

  async countProjectedActiveMembersByCooperative(
    cooperativeDids: readonly DID[],
  ): Promise<ReadonlyMap<string, number>> {
    return this.countProjectedMembershipRowsByCooperative(cooperativeDids, {
      status: 'active',
    });
  }

  async countProjectedMembershipRowsByCooperative(
    cooperativeDids: readonly DID[],
    opts: ProjectedMembershipCountOptions = {},
  ): Promise<ReadonlyMap<string, number>> {
    const counts = new Map<string, number>();
    const uniqueDids = [...new Set(cooperativeDids)];
    for (const did of uniqueDids) counts.set(did, 0);
    if (uniqueDids.length === 0) return counts;

    let query = this.db
      .selectFrom('membership')
      .where('cooperative_did', 'in', uniqueDids)
      .select(['cooperative_did'])
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .groupBy('cooperative_did');

    if (opts.status !== undefined) {
      query = query.where('status', '=', opts.status);
    }
    if (!opts.includeInvalidated) {
      query = query.where('invalidated_at', 'is', null);
    }

    const rows = await query.execute();

    for (const row of rows) {
      counts.set(row.cooperative_did, Number(row.count ?? 0));
    }
    return counts;
  }

  async countProjectedActiveCooperativesByMember(
    memberDids: readonly DID[],
  ): Promise<ReadonlyMap<string, number>> {
    const counts = new Map<string, number>();
    const uniqueDids = [...new Set(memberDids)];
    for (const did of uniqueDids) counts.set(did, 0);
    if (uniqueDids.length === 0) return counts;

    const rows = await this.db
      .selectFrom('membership')
      .where('member_did', 'in', uniqueDids)
      .where('status', '=', 'active')
      .where('invalidated_at', 'is', null)
      .select(['member_did'])
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .groupBy('member_did')
      .execute();

    for (const row of rows) {
      counts.set(row.member_did, Number(row.count ?? 0));
    }
    return counts;
  }

  async listProjectedMemberCooperatives(
    memberDid: DID,
    opts: ProjectedMemberCooperativesOptions = {},
  ): Promise<readonly MemberCooperativeSummary[]> {
    let query = this.db
      .selectFrom('membership')
      .innerJoin('entity', 'entity.did', 'membership.cooperative_did')
      .innerJoin(
        'cooperative_profile',
        'cooperative_profile.entity_did',
        'entity.did',
      )
      .where('membership.member_did', '=', memberDid)
      .where('membership.status', '=', 'active')
      .where('membership.invalidated_at', 'is', null)
      .where('entity.type', '=', 'cooperative')
      .where('entity.status', '=', 'active')
      .select([
        'entity.did',
        'entity.handle',
        'entity.display_name',
        'entity.description',
        'cooperative_profile.is_network',
        'cooperative_profile.cooperative_type',
        'cooperative_profile.website',
        'membership.joined_at',
      ]);

    if (opts.isNetwork !== undefined) {
      query = query.where(
        'cooperative_profile.is_network',
        '=',
        opts.isNetwork,
      );
    }
    if (opts.anonDiscoverable !== undefined) {
      query = query.where(
        'cooperative_profile.anon_discoverable',
        '=',
        opts.anonDiscoverable,
      );
    }
    if (opts.requireHandle) {
      query = query.where('entity.handle', 'is not', null);
    }

    const rows = await query.execute();
    return rows.map((row) => ({
      did: row.did,
      handle: row.handle,
      displayName: row.display_name,
      description: row.description,
      website: row.website,
      cooperativeType: row.cooperative_type,
      isNetwork: row.is_network,
      status: 'active',
      createdAt: row.joined_at ? row.joined_at.toISOString() : null,
    }));
  }

  async listProjectedActiveCooperativeDids(
    memberDid: DID,
  ): Promise<readonly DID[]> {
    const rows = await this.db
      .selectFrom('membership')
      .where('member_did', '=', memberDid)
      .where('status', '=', 'active')
      .where('invalidated_at', 'is', null)
      .select('cooperative_did')
      .distinct()
      .execute();

    return rows.map((row) => row.cooperative_did as DID);
  }

  async listProjectedActivePersonMemberDids(): Promise<readonly DID[]> {
    const rows = await this.db
      .selectFrom('membership')
      .innerJoin('entity', 'entity.did', 'membership.member_did')
      .where('membership.status', '=', 'active')
      .where('membership.invalidated_at', 'is', null)
      .where('entity.type', '=', 'person')
      .where('entity.status', '=', 'active')
      .where('entity.invalidated_at', 'is', null)
      .select('entity.did')
      .distinct()
      .execute();

    return rows.map((row) => row.did as DID);
  }

  async listProjectedActiveMemberDids(
    cooperativeDid: DID,
  ): Promise<readonly DID[]> {
    const rows = await this.db
      .selectFrom('membership')
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', '=', 'active')
      .where('invalidated_at', 'is', null)
      .select('member_did')
      .execute();

    return rows.map((row) => row.member_did as DID);
  }

  async getProjectedMembershipStatus(
    cooperativeDid: DID,
    memberDid: DID,
  ): Promise<ProjectedMembershipStatus | null> {
    const row = await this.db
      .selectFrom('membership')
      .where('member_did', '=', memberDid)
      .where('cooperative_did', '=', cooperativeDid)
      .where('invalidated_at', 'is', null)
      .select(['id', 'status'])
      .executeTakeFirst();

    return row ? { membershipId: row.id, status: row.status } : null;
  }

  async getProjectedMemberVoteWeight(
    cooperativeDid: DID,
    memberDid: DID,
  ): Promise<number> {
    return loadProjectedMemberVoteWeight(this.db, cooperativeDid, memberDid);
  }

  async getProjectedMemberClassMap(
    cooperativeDid: DID,
    memberDids: readonly DID[],
  ): Promise<ReadonlyMap<string, string | null>> {
    const uniqueDids = [...new Set(memberDids)];
    if (uniqueDids.length === 0) return new Map();

    const rows = await this.db
      .selectFrom('membership')
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', 'in', uniqueDids)
      .where('status', '=', 'active')
      .where('invalidated_at', 'is', null)
      .select(['member_did', 'member_class'])
      .execute();

    return new Map(rows.map((row) => [row.member_did, row.member_class]));
  }

  async countProjectedActiveMembersInClass(
    cooperativeDid: DID,
    className: string,
  ): Promise<number> {
    const result = await this.db
      .selectFrom('membership')
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_class', '=', className)
      .where('status', '=', 'active')
      .where('invalidated_at', 'is', null)
      .select((eb) => [eb.fn.countAll<number>().as('count')])
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  async getProjectedClassWeightDenominator(
    cooperativeDid: DID,
    className: string,
  ): Promise<number> {
    const result = await this.db
      .selectFrom('membership')
      .leftJoin('member_class', (j) =>
        j
          .onRef('member_class.name', '=', 'membership.member_class')
          .onRef(
            'member_class.cooperative_did',
            '=',
            'membership.cooperative_did',
          ),
      )
      .where('membership.cooperative_did', '=', cooperativeDid)
      .where('membership.member_class', '=', className)
      .where('membership.status', '=', 'active')
      .where('membership.invalidated_at', 'is', null)
      .select((eb) => [
        eb.fn
          .coalesce(eb.fn.sum<number>('member_class.vote_weight'), eb.val(0))
          .as('total_weight'),
      ])
      .executeTakeFirst();

    return Number(result?.total_weight ?? 0);
  }

  private async resolveMemberAuthority(
    cooperativeDid: DID,
    memberDid: DID,
  ): Promise<MembershipAuthoritySuccess | MembershipAuthorityFailure> {
    const authority = await this.resolveActiveMemberSet(cooperativeDid);
    if (!authority.ok) return authority;
    if (!authority.memberDids.has(memberDid)) {
      return membershipAuthorityFailure('not-member', 'No active membership');
    }
    return { ok: true };
  }

  private async resolveActiveMemberSet(
    cooperativeDid: DID,
  ): Promise<ActiveMemberSetResult> {
    let resolved;
    try {
      resolved = await this.groupDirectory.resolveSpaceMembers({
        ...membersSpace(cooperativeDid),
        consistency: 'strict',
      });
    } catch {
      return membershipAuthorityFailure(
        'unavailable',
        'Membership authority is unavailable',
      );
    }

    if (resolved.stale) {
      return membershipAuthorityFailure(
        'stale',
        'Membership authority returned stale data',
      );
    }
    if (resolved.partial) {
      return membershipAuthorityFailure(
        'partial',
        'Membership authority returned a partial result',
      );
    }
    if (!resolved.ok) {
      return membershipAuthorityFailure(
        'unavailable',
        'Membership authority is unavailable',
      );
    }
    return {
      ok: true,
      memberDids: new Set(resolved.members.map((member) => member.did)),
    };
  }

  private async loadActiveMembershipRow(
    cooperativeDid: DID,
    memberDid: DID,
  ): Promise<CandidateMembershipRow | undefined> {
    return this.db
      .selectFrom('membership')
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .where('status', '=', 'active')
      .where('invalidated_at', 'is', null)
      .select(['id', 'cooperative_did', 'member_did', 'joined_at'])
      .executeTakeFirst();
  }

  private async loadRoles(membershipId: string): Promise<readonly string[]> {
    const rows = await this.db
      .selectFrom('membership_role')
      .where('membership_id', '=', membershipId)
      .select('role')
      .execute();
    return rows.map((row) => row.role);
  }

  private async loadRoleMap(
    membershipIds: readonly string[],
  ): Promise<Map<string, string[]>> {
    const roleMap = new Map<string, string[]>();
    if (membershipIds.length === 0) return roleMap;

    const rows = await this.db
      .selectFrom('membership_role')
      .where('membership_id', 'in', membershipIds)
      .select(['membership_id', 'role'])
      .execute();
    for (const row of rows) {
      const roles = roleMap.get(row.membership_id) ?? [];
      roles.push(row.role);
      roleMap.set(row.membership_id, roles);
    }
    return roleMap;
  }

  private async loadMemberDirectoryRow(
    cooperativeDid: DID,
    memberDid: DID,
  ): Promise<MemberDirectoryRow | undefined> {
    return this.db
      .selectFrom('membership')
      .innerJoin('entity', 'entity.did', 'membership.member_did')
      .where('membership.cooperative_did', '=', cooperativeDid)
      .where('membership.member_did', '=', memberDid)
      .where('membership.invalidated_at', 'is', null)
      .select([
        'membership.id',
        'membership.member_did',
        'membership.status',
        'membership.joined_at',
        'membership.created_at',
        'membership.directory_visible',
        'entity.display_name',
      ])
      .executeTakeFirst();
  }

  private toMemberDirectoryEntry(
    row: MemberDirectoryRow,
    roleMap: ReadonlyMap<string, readonly string[]>,
  ): MemberDirectoryEntry {
    return {
      did: row.member_did,
      displayName: row.display_name,
      status: row.status,
      roles: roleMap.get(row.id) ?? [],
      membershipId: row.id,
      joinedAt: row.joined_at,
      directoryVisible: row.directory_visible,
    };
  }
}

export function membershipAuthorityFailure(
  reason: MembershipAuthorityFailureReason,
  message: string,
): MembershipAuthorityFailure {
  return { ok: false, axis: 'spaces', reason, message };
}

export function membershipAuthorityHttpStatus(
  failure: MembershipAuthorityFailure,
  deniedStatus: number,
): number {
  return failure.reason === 'not-member' ? deniedStatus : 503;
}

export function membershipAuthorityErrorCode(
  failure: MembershipAuthorityFailure,
  deniedCode: string,
): string {
  return failure.reason === 'not-member'
    ? deniedCode
    : 'SPACES_AUTHORITY_UNAVAILABLE';
}

export function membershipAuthorityAppError(
  failure: MembershipAuthorityFailure,
  deniedStatus: number,
  deniedCode: string,
): AppError & {
  readonly axis: MembershipAuthorityFailure['axis'];
  readonly reason: MembershipAuthorityFailure['reason'];
} {
  return Object.assign(
    new AppError(
      failure.message,
      membershipAuthorityHttpStatus(failure, deniedStatus),
      membershipAuthorityErrorCode(failure, deniedCode),
    ),
    { axis: failure.axis, reason: failure.reason },
  );
}

/**
 * Vote weight for an active member, or `null` when the DID has no active
 * membership in the cooperative.
 *
 * Callers on unauthenticated paths must treat `null` as "discard this record"
 * (audit C-01) — the previous `?? 1` default silently enfranchised arbitrary
 * public identities on the firehose.
 */
export async function loadActiveProjectedMemberVoteWeight(
  db: Kysely<Database>,
  cooperativeDid: DID,
  memberDid: DID,
): Promise<number | null> {
  const result = await db
    .selectFrom('membership')
    .leftJoin('member_class', (j) =>
      j
        .onRef('member_class.name', '=', 'membership.member_class')
        .onRef(
          'member_class.cooperative_did',
          '=',
          'membership.cooperative_did',
        ),
    )
    .where('membership.cooperative_did', '=', cooperativeDid)
    .where('membership.member_did', '=', memberDid)
    .where('membership.status', '=', 'active')
    .where('membership.invalidated_at', 'is', null)
    .select('member_class.vote_weight')
    .executeTakeFirst();

  if (!result) return null;
  return result.vote_weight ?? 1;
}

/**
 * Vote weight for callers that have already established membership, where a
 * missing row cannot mean an unknown identity. Prefer
 * {@link loadActiveProjectedMemberVoteWeight} on any path where it can.
 */
export async function loadProjectedMemberVoteWeight(
  db: Kysely<Database>,
  cooperativeDid: DID,
  memberDid: DID,
): Promise<number> {
  return (
    (await loadActiveProjectedMemberVoteWeight(db, cooperativeDid, memberDid)) ?? 1
  );
}
