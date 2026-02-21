import crypto from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { Database, InvitationTable } from '@coopsource/db';

type InvitationRow = Selectable<InvitationTable>;
import type { DID } from '@coopsource/common';
import { NotFoundError, ValidationError, ConflictError } from '@coopsource/common';
import type { IPdsService, IEmailService, IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

export interface MemberWithRoles {
  did: string;
  displayName: string;
  status: string;
  roles: string[];
  membershipId: string;
  joinedAt: Date | null;
}

export class MembershipService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private emailService: IEmailService,
    private clock: IClock,
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
    } catch {
      // Email send failure is not fatal
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

    // Write memberApproval PDS record
    const ref = await this.pdsService.createRecord({
      did: cooperativeDid as DID,
      collection: 'network.coopsource.org.memberApproval',
      record: {
        member: memberDid,
        roles,
        createdAt: now.toISOString(),
      },
    });

    // Update membership with approval info
    await this.db
      .updateTable('membership')
      .set({
        approval_record_uri: ref.uri,
        approval_record_cid: ref.cid,
        status: membership.status === 'pending' ? 'active' : membership.status,
        joined_at: now,
        indexed_at: now,
      })
      .where('id', '=', membership.id)
      .execute();

    // Set roles
    await this.db
      .deleteFrom('membership_role')
      .where('membership_id', '=', membership.id)
      .execute();

    if (roles.length > 0) {
      await this.db
        .insertInto('membership_role')
        .values(
          roles.map((role) => ({
            membership_id: membership.id,
            role,
            indexed_at: now,
          })),
        )
        .execute();
    }
  }

  async updateMemberRoles(
    cooperativeDid: string,
    memberDid: string,
    roles: string[],
  ): Promise<void> {
    const membership = await this.db
      .selectFrom('membership')
      .where('member_did', '=', memberDid)
      .where('cooperative_did', '=', cooperativeDid)
      .where('invalidated_at', 'is', null)
      .select(['id', 'approval_record_uri', 'approval_record_cid'])
      .executeTakeFirst();

    if (!membership) {
      throw new NotFoundError('Membership not found');
    }

    const now = this.clock.now();

    // Replace membership_role rows
    await this.db
      .deleteFrom('membership_role')
      .where('membership_id', '=', membership.id)
      .execute();

    if (roles.length > 0) {
      await this.db
        .insertInto('membership_role')
        .values(
          roles.map((role) => ({
            membership_id: membership.id,
            role,
            indexed_at: now,
          })),
        )
        .execute();
    }
  }

  async removeMember(
    cooperativeDid: string,
    memberDid: string,
    reason?: string,
  ): Promise<void> {
    const membership = await this.db
      .selectFrom('membership')
      .where('member_did', '=', memberDid)
      .where('cooperative_did', '=', cooperativeDid)
      .where('invalidated_at', 'is', null)
      .select('id')
      .executeTakeFirst();

    if (!membership) {
      throw new NotFoundError('Membership not found');
    }

    const now = this.clock.now();

    await this.db
      .updateTable('membership')
      .set({
        status: 'suspended',
        status_reason: reason ?? null,
        departed_at: now,
        invalidated_at: now,
        indexed_at: now,
      })
      .where('id', '=', membership.id)
      .execute();
  }
}
