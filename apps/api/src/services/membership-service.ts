import crypto from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { Database, InvitationTable } from '@coopsource/db';

type InvitationRow = Selectable<InvitationTable>;
import type { DID } from '@coopsource/common';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ConflictError,
} from '@coopsource/common';
import type {
  GroupMutationPort,
  GroupMutationResult,
} from '@coopsource/arbiter-client';
import { membersSpace } from '@coopsource/arbiter-client';
import type {
  ActionAuthorizerPlugin,
  JsonObject,
} from '@coopsource/governance-view';
import type { IEmailService, IClock } from '@coopsource/federation';
import { logger } from '../middleware/logger.js';
import {
  emitMemberJoined,
  emitMemberDeparted,
} from '../appview/membership-events.js';
import type { MembershipReadModel } from './membership-read-model.js';
import {
  assertRolesAssignable,
  loadCurrentMemberRoles,
} from './role-assignment-ceiling.js';

export class MembershipService {
  constructor(
    private db: Kysely<Database>,
    private emailService: IEmailService,
    private clock: IClock,
    private groupMutations: GroupMutationPort,
    private membershipReadModel: MembershipReadModel,
    private actionAuthorizer?: ActionAuthorizerPlugin,
  ) {}

  async createInvitation(params: {
    cooperativeDid: string;
    invitedByDid: string;
    email: string;
    intendedRoles?: string[];
    message?: string;
    instanceUrl: string;
  }): Promise<InvitationRow> {
    await this.authorizeMemberCommand({
      cooperativeDid: params.cooperativeDid,
      actorDid: params.invitedByDid,
      action: 'member.invite',
      payload: {
        inviteeEmail: params.email,
        intendedRoles: params.intendedRoles ?? ['member'],
      },
    });

    await this.authorizeRoleAssignment({
      cooperativeDid: params.cooperativeDid,
      actorDid: params.invitedByDid,
      requestedRoles: params.intendedRoles ?? ['member'],
    });

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
      logger.warn(
        { err, email: params.email },
        'Failed to send invitation email',
      );
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

  /**
   * Admit a member whose membership is pending — a request under a
   * request-and-approve admission policy, or an invitation awaiting approval.
   * The role ceiling applies, so an approver cannot admit someone at a level
   * above their own (audit S-01, S-02).
   */
  async approveMembership(
    cooperativeDid: string,
    memberDid: string,
    roles: string[],
    actorDid: string = cooperativeDid,
  ): Promise<void> {
    await this.authorizeMemberCommand({
      cooperativeDid,
      actorDid,
      action: 'member.approve',
      payload: { memberDid, roles },
    });

    await this.authorizeRoleAssignment({
      cooperativeDid,
      actorDid,
      requestedRoles: roles,
      targetDid: memberDid,
    });

    const membership =
      await this.membershipReadModel.getProjectedMembershipStatus(
        cooperativeDid as DID,
        memberDid as DID,
      );

    if (!membership) {
      throw new NotFoundError('Membership not found');
    }

    const now = this.clock.now();
    this.assertCommandOk(
      await this.groupMutations.addMember({
        cooperativeDid: cooperativeDid as DID,
        memberDid: memberDid as DID,
        actorDid: actorDid as DID,
        roles,
        joinedAt: now,
        reason:
          membership.status === 'pending' ? 'approve invitation' : undefined,
      }),
    );
    emitMemberJoined(cooperativeDid, memberDid);
  }

  async updateMemberRoles(
    cooperativeDid: string,
    memberDid: string,
    roles: string[],
    actorDid: string = cooperativeDid,
  ): Promise<void> {
    await this.authorizeMemberCommand({
      cooperativeDid,
      actorDid,
      action: 'member.roles.assign',
      payload: { memberDid, roles },
    });

    await this.authorizeRoleAssignment({
      cooperativeDid,
      actorDid,
      requestedRoles: roles,
      targetDid: memberDid,
    });

    this.assertCommandOk(
      await this.groupMutations.setMemberRoles({
        cooperativeDid: cooperativeDid as DID,
        memberDid: memberDid as DID,
        roles,
        actorDid: actorDid as DID,
      }),
    );
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
    await this.authorizeMemberCommand({
      cooperativeDid,
      actorDid,
      action: 'member.remove',
      payload: { memberDid, reason: reason ?? null },
    });

    this.assertCommandOk(
      await this.groupMutations.removeMember({
        cooperativeDid: cooperativeDid as DID,
        memberDid: memberDid as DID,
        actorDid: actorDid as DID,
        reason,
      }),
    );
    emitMemberDeparted(cooperativeDid, memberDid);
  }

  async suspendMember(
    cooperativeDid: string,
    memberDid: string,
    reason?: string,
    actorDid: string = cooperativeDid,
  ): Promise<void> {
    await this.authorizeMemberCommand({
      cooperativeDid,
      actorDid,
      action: 'member.remove',
      payload: { memberDid, reason: reason ?? null },
    });

    this.assertCommandOk(
      await this.groupMutations.suspendMember({
        cooperativeDid: cooperativeDid as DID,
        memberDid: memberDid as DID,
        actorDid: actorDid as DID,
        reason,
      }),
    );
  }

  async reinstateMember(
    cooperativeDid: string,
    memberDid: string,
    reason?: string,
    actorDid: string = cooperativeDid,
  ): Promise<void> {
    await this.authorizeMemberCommand({
      cooperativeDid,
      actorDid,
      action: 'member.remove',
      payload: { memberDid, reason: reason ?? null },
    });

    this.assertCommandOk(
      await this.groupMutations.reinstateMember({
        cooperativeDid: cooperativeDid as DID,
        memberDid: memberDid as DID,
        actorDid: actorDid as DID,
        reason,
      }),
    );
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

  /**
   * Reject role assignments that would grant more authority than the actor
   * holds (audit S-01). The cooperative acting on its own behalf is the same
   * system-level bypass `authorizeMemberCommand` uses.
   */
  private async authorizeRoleAssignment(args: {
    readonly cooperativeDid: string;
    readonly actorDid: string;
    readonly requestedRoles: readonly string[];
    /** Omitted when the subject holds no roles yet, as for a new invitation. */
    readonly targetDid?: string;
  }): Promise<void> {
    if (args.actorDid === args.cooperativeDid) return;

    const actor = await this.membershipReadModel.getActiveMembershipResult(
      args.cooperativeDid as DID,
      args.actorDid as DID,
    );
    const actorRoles = actor.ok ? actor.membership.roles : [];

    const currentRoles = args.targetDid
      ? await loadCurrentMemberRoles(this.db, args.cooperativeDid, args.targetDid)
      : [];

    await assertRolesAssignable({
      db: this.db,
      cooperativeDid: args.cooperativeDid,
      actorRoles,
      currentRoles,
      requestedRoles: args.requestedRoles,
    });
  }

  private async authorizeMemberCommand(args: {
    readonly cooperativeDid: string;
    readonly actorDid: string;
    readonly action: string;
    readonly payload?: JsonObject;
  }): Promise<void> {
    if (!this.actionAuthorizer || args.actorDid === args.cooperativeDid) {
      return;
    }

    const memberSpace = membersSpace(args.cooperativeDid as DID);
    const decision = await this.actionAuthorizer.authorize({
      actor: { did: args.actorDid },
      cooperative: {
        authorityDid: args.cooperativeDid,
        spaceKey: memberSpace.spaceKey,
        spaceType: memberSpace.expectedSpaceType,
      },
      action: args.action,
      at: this.clock.now().toISOString(),
      payload: args.payload ?? null,
    });

    if (!decision.authorized) {
      throw new UnauthorizedError('Insufficient permissions');
    }
  }
}
