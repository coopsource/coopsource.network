import crypto from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { Database, InvitationTable } from '@coopsource/db';

type InvitationRow = Selectable<InvitationTable>;
import type { DID } from '@coopsource/common';
import { NotFoundError, ValidationError, ConflictError } from '@coopsource/common';
import type { GroupMutationPort, GroupMutationResult } from '@coopsource/arbiter-client';
import type { IEmailService, IClock } from '@coopsource/federation';
import { logger } from '../middleware/logger.js';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

export interface MemberWithRoles {
  did: string;
  displayName: string;
  status: string;
  roles: string[];
  membershipId: string;
  joinedAt: Date | null;
  directoryVisible: boolean;
}

export class MembershipService {
  constructor(
    private db: Kysely<Database>,
    private emailService: IEmailService,
    private clock: IClock,
    private groupMutations: GroupMutationPort,
  ) {}

  async listMembers(
    cooperativeDid: string,
    params: PageParams,
  ): Promise<Page<MemberWithRoles>> {
    const limit = params.limit ?? 50;
    let query = this.db
      .selectFrom('membership')
      .innerJoin('entity', 'entity.did', 'membership.member_did')
      .where('membership.cooperative_did', '=', cooperativeDid)
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

    const items: MemberWithRoles[] = [];
    const slice = rows.slice(0, limit);

    for (const row of slice) {
      const roleRows = await this.db
        .selectFrom('membership_role')
        .where('membership_id', '=', row.id)
        .select('role')
        .execute();

      items.push({
        did: row.member_did,
        displayName: row.display_name,
        status: row.status,
        roles: roleRows.map((r) => r.role),
        membershipId: row.id,
        joinedAt: row.joined_at,
        directoryVisible: row.directory_visible,
      });
    }

    const cursor =
      rows.length > limit
        ? encodeCursor(slice[slice.length - 1]!.created_at, slice[slice.length - 1]!.id)
        : undefined;

    return { items, cursor };
  }

  async getMember(
    cooperativeDid: string,
    memberDid: string,
  ): Promise<MemberWithRoles | null> {
    const row = await this.db
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
        'membership.directory_visible',
        'entity.display_name',
      ])
      .executeTakeFirst();

    if (!row) return null;

    const roleRows = await this.db
      .selectFrom('membership_role')
      .where('membership_id', '=', row.id)
      .select('role')
      .execute();

    return {
      did: row.member_did,
      displayName: row.display_name,
      status: row.status,
      roles: roleRows.map((r) => r.role),
      membershipId: row.id,
      joinedAt: row.joined_at,
      directoryVisible: row.directory_visible,
    };
  }

  async createInvitation(params: {
    cooperativeDid: string;
    invitedByDid: string;
    email: string;
    intendedRoles?: string[];
    message?: string;
    instanceUrl: string;
  }): Promise<InvitationRow> {
    // Check for existing pending invitation to same email
    const existing = await this.db
      .selectFrom('invitation')
      .where('cooperative_did', '=', params.cooperativeDid)
      .where('invitee_email', '=', params.email)
      .where('status', '=', 'pending')
      .where('invalidated_at', 'is', null)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictError('Invitation already pending for this email');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [row] = await this.db
      .insertInto('invitation')
      .values({
        cooperative_did: params.cooperativeDid,
        invited_by_did: params.invitedByDid,
        invitee_email: params.email,
        intended_roles: params.intendedRoles ?? ['member'],
        token,
        message: params.message ?? null,
        status: 'pending',
        expires_at: expiresAt,
        created_at: now,
      })
      .returningAll()
      .execute();

    // Get inviter name and coop name for email
    const inviter = await this.db
      .selectFrom('entity')
      .where('did', '=', params.invitedByDid)
      .select('display_name')
      .executeTakeFirst();

    const coop = await this.db
      .selectFrom('entity')
      .where('did', '=', params.cooperativeDid)
      .select('display_name')
      .executeTakeFirst();

    // Send invitation email (best-effort)
    try {
      await this.emailService.sendInvitation({
        to: params.email,
        inviterName: inviter?.display_name ?? 'A member',
        coopName: coop?.display_name ?? 'a cooperative',
        token,
        inviteUrl: `${params.instanceUrl}/invite/${token}`,
        message: params.message,
        expiresAt,
      });
    } catch (err) {
      logger.warn({ err, email: params.email }, 'Failed to send invitation email');
    }

    return row!;
  }

  async acceptInvitation(
    token: string,
  ): Promise<{ invitation: InvitationRow }> {
    const inv = await this.db
      .selectFrom('invitation')
      .where('token', '=', token)
      .where('status', '=', 'pending')
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    if (!inv) {
      throw new NotFoundError('Invitation not found or already used');
    }

    if (new Date(inv.expires_at) < this.clock.now()) {
      throw new ValidationError('Invitation has expired');
    }

    // Mark as accepted (actual registration happens via AuthService.register)
    await this.db
      .updateTable('invitation')
      .set({ status: 'accepted' })
      .where('id', '=', inv.id)
      .execute();

    return { invitation: { ...inv, status: 'accepted' } as InvitationRow };
  }

  async approveInvitation(
    cooperativeDid: string,
    memberDid: string,
    roles: string[],
    actorDid: string = cooperativeDid,
  ): Promise<void> {
    const membership = await this.db
      .selectFrom('membership')
      .where('member_did', '=', memberDid)
      .where('cooperative_did', '=', cooperativeDid)
      .where('invalidated_at', 'is', null)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!membership) {
      throw new NotFoundError('Membership not found');
    }

    const now = this.clock.now();
    this.assertCommandOk(await this.groupMutations.addMember({
      cooperativeDid: cooperativeDid as DID,
      memberDid: memberDid as DID,
      actorDid: actorDid as DID,
      roles,
      joinedAt: now,
      reason: membership.status === 'pending' ? 'approve invitation' : undefined,
    }));
  }

  async updateMemberRoles(
    cooperativeDid: string,
    memberDid: string,
    roles: string[],
    actorDid: string = cooperativeDid,
  ): Promise<void> {
    this.assertCommandOk(await this.groupMutations.setMemberRoles({
      cooperativeDid: cooperativeDid as DID,
      memberDid: memberDid as DID,
      roles,
      actorDid: actorDid as DID,
    }));
  }

  /**
   * Set a member's own directory visibility. Directory listing is opt-in
   * (default false), so this is the member-facing path to appear in the
   * cooperative's public member directory. Only affects an active membership.
   */
  async setDirectoryVisibility(
    cooperativeDid: string,
    memberDid: string,
    visible: boolean,
  ): Promise<void> {
    const result = await this.db
      .updateTable('membership')
      .set({ directory_visible: visible })
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .where('status', '=', 'active')
      .where('invalidated_at', 'is', null)
      .executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) {
      throw new NotFoundError('Active membership not found');
    }
  }

  async removeMember(
    cooperativeDid: string,
    memberDid: string,
    reason?: string,
    actorDid: string = cooperativeDid,
  ): Promise<void> {
    this.assertCommandOk(await this.groupMutations.removeMember({
      cooperativeDid: cooperativeDid as DID,
      memberDid: memberDid as DID,
      actorDid: actorDid as DID,
      reason,
    }));
  }

  async suspendMember(
    cooperativeDid: string,
    memberDid: string,
    reason?: string,
    actorDid: string = cooperativeDid,
  ): Promise<void> {
    this.assertCommandOk(await this.groupMutations.suspendMember({
      cooperativeDid: cooperativeDid as DID,
      memberDid: memberDid as DID,
      actorDid: actorDid as DID,
      reason,
    }));
  }

  async reinstateMember(
    cooperativeDid: string,
    memberDid: string,
    reason?: string,
    actorDid: string = cooperativeDid,
  ): Promise<void> {
    this.assertCommandOk(await this.groupMutations.reinstateMember({
      cooperativeDid: cooperativeDid as DID,
      memberDid: memberDid as DID,
      actorDid: actorDid as DID,
      reason,
    }));
  }

  private assertCommandOk(result: GroupMutationResult): void {
    if (result.ok && result.reason !== 'not-found') {
      return;
    }
    if (result.reason === 'invalid-role') {
      throw new ValidationError('Role must be a non-empty string');
    }
    throw new NotFoundError('Membership not found');
  }
}
