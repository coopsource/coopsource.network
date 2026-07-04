import type { DID } from '@coopsource/common';
import type { Database, FactLogTable, MembershipTable } from '@coopsource/db';
import type { SpaceRef, UnknownLexiconObject } from '@coopsource/spaces-consumer';
import type { Kysely, Selectable, Transaction } from 'kysely';
import { membersSpace, roleSpace } from './space-ref.js';

const AUDIT_ENTITY_TYPE = 'v11.groupMutation';
const AUDIT_CURSOR_PREFIX = 'fact-log-v1';
const DEFAULT_AUDIT_LIMIT = 100;
const MAX_AUDIT_LIMIT = 500;

type MutationDb = Kysely<Database> | Transaction<Database>;
type MembershipRow = Selectable<MembershipTable>;
type FactLogRow = Selectable<FactLogTable>;

export type GroupMutationOperation =
  | 'provision-cooperative-authority'
  | 'ensure-role-space'
  | 'add-member'
  | 'remove-member'
  | 'add-role-member'
  | 'remove-role-member'
  | 'set-member-roles';

export type GroupMutationFailureReason = 'invalid-role' | 'not-found';

export interface GroupMutationResult {
  readonly ok: boolean;
  readonly changed: boolean;
  readonly operation: GroupMutationOperation;
  readonly cooperativeDid: DID;
  readonly memberDid?: DID;
  readonly role?: string;
  readonly space?: SpaceRef;
  readonly sourceRevision?: string;
  readonly auditEventId?: string;
  readonly reason?: GroupMutationFailureReason;
}

export interface ProvisionCooperativeAuthorityResult extends GroupMutationResult {
  readonly arbiterDid: DID;
  readonly membersSpace: SpaceRef;
}

export interface GroupMutationContext {
  readonly actorDid: DID;
  readonly reason?: string;
  readonly auditMetadata?: UnknownLexiconObject;
  readonly governanceOutcomeRef?: string;
}

export interface AddMemberArgs {
  readonly cooperativeDid: DID;
  readonly memberDid: DID;
  readonly roles?: ReadonlyArray<string>;
  readonly memberClass?: string | null;
  readonly directoryVisible?: boolean;
  readonly consentRecordUri?: string | null;
  readonly consentRecordCid?: string | null;
  readonly invitationId?: string | null;
  readonly joinedAt?: Date;
  readonly actorDid: DID;
  readonly reason?: string;
  readonly auditMetadata?: UnknownLexiconObject;
  readonly governanceOutcomeRef?: string;
}

export interface GroupMutationAuditEvent {
  readonly id: string;
  readonly cooperativeDid: DID;
  readonly operation: GroupMutationOperation;
  readonly actorDid: DID | null;
  readonly memberDid?: DID;
  readonly role?: string;
  readonly changedAt: Date;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly reason: string | null;
  readonly auditMetadata?: UnknownLexiconObject;
  readonly governanceOutcomeRef?: string;
}

export interface GroupMutationAuditPage {
  readonly events: ReadonlyArray<GroupMutationAuditEvent>;
  readonly cursor?: string;
}

export interface GroupMutationPort {
  provisionCooperativeAuthority(args: {
    readonly cooperativeDid: DID;
    readonly actorDid: DID;
    readonly reason?: string;
    readonly auditMetadata?: UnknownLexiconObject;
    readonly governanceOutcomeRef?: string;
  }): Promise<ProvisionCooperativeAuthorityResult>;

  ensureRoleSpace(args: {
    readonly cooperativeDid: DID;
    readonly role: string;
    readonly actorDid: DID;
    readonly reason?: string;
    readonly auditMetadata?: UnknownLexiconObject;
    readonly governanceOutcomeRef?: string;
  }): Promise<GroupMutationResult>;

  addMember(args: AddMemberArgs): Promise<GroupMutationResult>;

  removeMember(args: {
    readonly cooperativeDid: DID;
    readonly memberDid: DID;
    readonly actorDid: DID;
    readonly reason?: string;
    readonly auditMetadata?: UnknownLexiconObject;
    readonly governanceOutcomeRef?: string;
  }): Promise<GroupMutationResult>;

  addRoleMember(args: {
    readonly cooperativeDid: DID;
    readonly role: string;
    readonly memberDid: DID;
    readonly actorDid: DID;
    readonly reason?: string;
    readonly auditMetadata?: UnknownLexiconObject;
    readonly governanceOutcomeRef?: string;
  }): Promise<GroupMutationResult>;

  removeRoleMember(args: {
    readonly cooperativeDid: DID;
    readonly role: string;
    readonly memberDid: DID;
    readonly actorDid: DID;
    readonly reason?: string;
    readonly auditMetadata?: UnknownLexiconObject;
    readonly governanceOutcomeRef?: string;
  }): Promise<GroupMutationResult>;

  setMemberRoles(args: {
    readonly cooperativeDid: DID;
    readonly memberDid: DID;
    readonly roles: ReadonlyArray<string>;
    readonly actorDid: DID;
    readonly reason?: string;
    readonly auditMetadata?: UnknownLexiconObject;
    readonly governanceOutcomeRef?: string;
  }): Promise<GroupMutationResult>;

  listAuditEvents(args: {
    readonly cooperativeDid: DID;
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<GroupMutationAuditPage>;
}

export interface CsnDbGroupMutationPortOptions {
  readonly now?: () => Date;
}

/**
 * Write side of the Arbiter boundary, temporarily backed by CSN's own
 * `membership`/`membership_role` tables. Phase 3 swaps this for an XRPC
 * adapter against the draft `town.muni.arbiter.*` mutation lexicons
 * (createSpace / removeSpaceMember / setSpaceMemberAccess; createDid /
 * updateDidDoc for controlled-DID provisioning). See ARCHITECTURE-V12 §4.
 */
export class CsnDbGroupMutationPort implements GroupMutationPort {
  constructor(
    private readonly db: MutationDb,
    private readonly options: CsnDbGroupMutationPortOptions = {},
  ) {}

  async provisionCooperativeAuthority(args: {
    readonly cooperativeDid: DID;
    readonly actorDid: DID;
    readonly reason?: string;
    readonly auditMetadata?: UnknownLexiconObject;
    readonly governanceOutcomeRef?: string;
  }): Promise<ProvisionCooperativeAuthorityResult> {
    return {
      ok: true,
      changed: false,
      operation: 'provision-cooperative-authority',
      cooperativeDid: args.cooperativeDid,
      arbiterDid: args.cooperativeDid,
      membersSpace: membersSpace(args.cooperativeDid),
      space: membersSpace(args.cooperativeDid),
      sourceRevision: this.now().toISOString(),
    };
  }

  async ensureRoleSpace(args: {
    readonly cooperativeDid: DID;
    readonly role: string;
    readonly actorDid: DID;
    readonly reason?: string;
    readonly auditMetadata?: UnknownLexiconObject;
    readonly governanceOutcomeRef?: string;
  }): Promise<GroupMutationResult> {
    const role = normalizeRole(args.role);
    if (!role) {
      return this.invalidRoleResult('ensure-role-space', args.cooperativeDid, args.role);
    }

    return {
      ok: true,
      changed: false,
      operation: 'ensure-role-space',
      cooperativeDid: args.cooperativeDid,
      role,
      space: roleSpace(args.cooperativeDid, role),
      sourceRevision: this.now().toISOString(),
    };
  }

  async addMember(args: AddMemberArgs): Promise<GroupMutationResult> {
    const roles = args.roles === undefined ? undefined : normalizeRoles(args.roles);
    if (roles?.invalid) {
      return this.invalidRoleResult('add-member', args.cooperativeDid, roles.invalid);
    }

    return runInTransaction(this.db, async (trx) => {
      const now = this.now();
      const existing = await findOpenMembership(trx, args.cooperativeDid, args.memberDid);
      const beforeRoles = existing ? await loadRoles(trx, existing.id) : [];
      let membershipId = existing?.id;
      let membershipChanged = false;

      if (existing) {
        const update = buildMemberUpdate(existing, args, now);
        membershipChanged = Object.keys(update).length > 1;
        if (membershipChanged) {
          await trx
            .updateTable('membership')
            .set(update)
            .where('id', '=', existing.id)
            .execute();
        }
      } else {
        const [inserted] = await trx
          .insertInto('membership')
          .values({
            member_did: args.memberDid,
            cooperative_did: args.cooperativeDid,
            status: 'active',
            member_class: args.memberClass ?? null,
            member_record_uri: args.consentRecordUri ?? null,
            member_record_cid: args.consentRecordCid ?? null,
            approval_record_uri: null,
            approval_record_cid: null,
            invitation_id: args.invitationId ?? null,
            joined_at: args.joinedAt ?? now,
            departed_at: null,
            status_reason: null,
            // Directory visibility is opt-in (matches the column default and
            // V9 behavior): members appear in unauthenticated listings only
            // if they explicitly chose to.
            directory_visible: args.directoryVisible ?? false,
            created_at: now,
            created_by: args.actorDid,
            invalidated_at: null,
            invalidated_by: null,
            indexed_at: now,
          })
          .returning('id')
          .execute();
        membershipId = inserted!.id;
        membershipChanged = true;
      }

      const roleChange =
        roles === undefined || !membershipId
          ? { changed: false, oldRoles: beforeRoles, newRoles: beforeRoles }
          : await replaceRoles(trx, membershipId, beforeRoles, roles.roles, now);

      const changed = membershipChanged || roleChange.changed;
      const auditEventId = changed
        ? await insertAuditEvent(trx, {
            cooperativeDid: args.cooperativeDid,
            actorDid: args.actorDid,
            operation: 'add-member',
            memberDid: args.memberDid,
            changedAt: now,
            oldValue: existing
              ? memberAuditValue(existing, beforeRoles)
              : null,
            newValue: {
              memberDid: args.memberDid,
              status: 'active',
              roles: roleChange.newRoles,
              memberClass: args.memberClass ?? existing?.member_class ?? null,
              // Mirror the insert/update default (opt-in, false) so the audit
              // record matches the row actually written.
              directoryVisible: args.directoryVisible ?? existing?.directory_visible ?? false,
              consentRecordUri: args.consentRecordUri ?? existing?.member_record_uri ?? null,
              consentRecordCid: args.consentRecordCid ?? existing?.member_record_cid ?? null,
            },
            reason: args.reason ?? null,
            auditMetadata: args.auditMetadata,
            governanceOutcomeRef: args.governanceOutcomeRef,
          })
        : undefined;

      return {
        ok: true,
        changed,
        operation: 'add-member',
        cooperativeDid: args.cooperativeDid,
        memberDid: args.memberDid,
        space: membersSpace(args.cooperativeDid),
        sourceRevision: now.toISOString(),
        auditEventId,
      };
    });
  }

  async removeMember(args: {
    readonly cooperativeDid: DID;
    readonly memberDid: DID;
    readonly actorDid: DID;
    readonly reason?: string;
    readonly auditMetadata?: UnknownLexiconObject;
    readonly governanceOutcomeRef?: string;
  }): Promise<GroupMutationResult> {
    return runInTransaction(this.db, async (trx) => {
      const now = this.now();
      const existing = await findOpenMembership(trx, args.cooperativeDid, args.memberDid);
      if (!existing) {
        return {
          ok: true,
          changed: false,
          operation: 'remove-member',
          cooperativeDid: args.cooperativeDid,
          memberDid: args.memberDid,
          space: membersSpace(args.cooperativeDid),
          sourceRevision: now.toISOString(),
          reason: 'not-found',
        };
      }

      const oldRoles = await loadRoles(trx, existing.id);
      await trx
        .updateTable('membership')
        .set({
          status: 'departed',
          status_reason: args.reason ?? null,
          departed_at: now,
          invalidated_at: now,
          invalidated_by: args.actorDid,
          indexed_at: now,
        })
        .where('id', '=', existing.id)
        .execute();

      const auditEventId = await insertAuditEvent(trx, {
        cooperativeDid: args.cooperativeDid,
        actorDid: args.actorDid,
        operation: 'remove-member',
        memberDid: args.memberDid,
        changedAt: now,
        oldValue: memberAuditValue(existing, oldRoles),
        newValue: {
          memberDid: args.memberDid,
          status: 'departed',
          roles: oldRoles,
        },
        reason: args.reason ?? null,
        auditMetadata: args.auditMetadata,
        governanceOutcomeRef: args.governanceOutcomeRef,
      });

      return {
        ok: true,
        changed: true,
        operation: 'remove-member',
        cooperativeDid: args.cooperativeDid,
        memberDid: args.memberDid,
        space: membersSpace(args.cooperativeDid),
        sourceRevision: now.toISOString(),
        auditEventId,
      };
    });
  }

  async addRoleMember(args: {
    readonly cooperativeDid: DID;
    readonly role: string;
    readonly memberDid: DID;
    readonly actorDid: DID;
    readonly reason?: string;
    readonly auditMetadata?: UnknownLexiconObject;
    readonly governanceOutcomeRef?: string;
  }): Promise<GroupMutationResult> {
    const role = normalizeRole(args.role);
    if (!role) {
      return this.invalidRoleResult('add-role-member', args.cooperativeDid, args.role, args.memberDid);
    }

    return runInTransaction(this.db, async (trx) => {
      const now = this.now();
      const membership = await findActiveMembership(trx, args.cooperativeDid, args.memberDid);
      if (!membership) {
        return roleResult('add-role-member', args.cooperativeDid, args.memberDid, role, false, now, 'not-found');
      }

      const existing = await trx
        .selectFrom('membership_role')
        .where('membership_id', '=', membership.id)
        .where('role', '=', role)
        .select('role')
        .executeTakeFirst();

      if (existing) {
        return roleResult('add-role-member', args.cooperativeDid, args.memberDid, role, false, now);
      }

      const oldRoles = await loadRoles(trx, membership.id);
      await trx
        .insertInto('membership_role')
        .values({ membership_id: membership.id, role, indexed_at: now })
        .execute();

      const auditEventId = await insertAuditEvent(trx, {
        cooperativeDid: args.cooperativeDid,
        actorDid: args.actorDid,
        operation: 'add-role-member',
        memberDid: args.memberDid,
        role,
        changedAt: now,
        oldValue: { memberDid: args.memberDid, roles: oldRoles },
        newValue: { memberDid: args.memberDid, roles: [...oldRoles, role].sort(), role },
        reason: args.reason ?? null,
        auditMetadata: args.auditMetadata,
        governanceOutcomeRef: args.governanceOutcomeRef,
      });

      return roleResult('add-role-member', args.cooperativeDid, args.memberDid, role, true, now, undefined, auditEventId);
    });
  }

  async removeRoleMember(args: {
    readonly cooperativeDid: DID;
    readonly role: string;
    readonly memberDid: DID;
    readonly actorDid: DID;
    readonly reason?: string;
    readonly auditMetadata?: UnknownLexiconObject;
    readonly governanceOutcomeRef?: string;
  }): Promise<GroupMutationResult> {
    const role = normalizeRole(args.role);
    if (!role) {
      return this.invalidRoleResult('remove-role-member', args.cooperativeDid, args.role, args.memberDid);
    }

    return runInTransaction(this.db, async (trx) => {
      const now = this.now();
      const membership = await findActiveMembership(trx, args.cooperativeDid, args.memberDid);
      if (!membership) {
        return roleResult('remove-role-member', args.cooperativeDid, args.memberDid, role, false, now, 'not-found', undefined, true);
      }

      const oldRoles = await loadRoles(trx, membership.id);
      if (!oldRoles.includes(role)) {
        return roleResult('remove-role-member', args.cooperativeDid, args.memberDid, role, false, now, 'not-found', undefined, true);
      }

      await trx
        .deleteFrom('membership_role')
        .where('membership_id', '=', membership.id)
        .where('role', '=', role)
        .execute();

      const newRoles = oldRoles.filter((oldRole) => oldRole !== role);
      const auditEventId = await insertAuditEvent(trx, {
        cooperativeDid: args.cooperativeDid,
        actorDid: args.actorDid,
        operation: 'remove-role-member',
        memberDid: args.memberDid,
        role,
        changedAt: now,
        oldValue: { memberDid: args.memberDid, roles: oldRoles, role },
        newValue: { memberDid: args.memberDid, roles: newRoles },
        reason: args.reason ?? null,
        auditMetadata: args.auditMetadata,
        governanceOutcomeRef: args.governanceOutcomeRef,
      });

      return roleResult('remove-role-member', args.cooperativeDid, args.memberDid, role, true, now, undefined, auditEventId);
    });
  }

  async setMemberRoles(args: {
    readonly cooperativeDid: DID;
    readonly memberDid: DID;
    readonly roles: ReadonlyArray<string>;
    readonly actorDid: DID;
    readonly reason?: string;
    readonly auditMetadata?: UnknownLexiconObject;
    readonly governanceOutcomeRef?: string;
  }): Promise<GroupMutationResult> {
    const roles = normalizeRoles(args.roles);
    if (roles.invalid) {
      return this.invalidRoleResult('set-member-roles', args.cooperativeDid, roles.invalid, args.memberDid);
    }

    return runInTransaction(this.db, async (trx) => {
      const now = this.now();
      const membership = await findActiveMembership(trx, args.cooperativeDid, args.memberDid);
      if (!membership) {
        return {
          ok: false,
          changed: false,
          operation: 'set-member-roles',
          cooperativeDid: args.cooperativeDid,
          memberDid: args.memberDid,
          space: membersSpace(args.cooperativeDid),
          sourceRevision: now.toISOString(),
          reason: 'not-found',
        };
      }

      const oldRoles = await loadRoles(trx, membership.id);
      const roleChange = await replaceRoles(trx, membership.id, oldRoles, roles.roles, now);
      const auditEventId = roleChange.changed
        ? await insertAuditEvent(trx, {
            cooperativeDid: args.cooperativeDid,
            actorDid: args.actorDid,
            operation: 'set-member-roles',
            memberDid: args.memberDid,
            changedAt: now,
            oldValue: { memberDid: args.memberDid, roles: oldRoles },
            newValue: { memberDid: args.memberDid, roles: roleChange.newRoles },
            reason: args.reason ?? null,
            auditMetadata: args.auditMetadata,
            governanceOutcomeRef: args.governanceOutcomeRef,
          })
        : undefined;

      return {
        ok: true,
        changed: roleChange.changed,
        operation: 'set-member-roles',
        cooperativeDid: args.cooperativeDid,
        memberDid: args.memberDid,
        space: membersSpace(args.cooperativeDid),
        sourceRevision: now.toISOString(),
        auditEventId,
      };
    });
  }

  async listAuditEvents(args: {
    readonly cooperativeDid: DID;
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<GroupMutationAuditPage> {
    const limit = clampLimit(args.limit);
    const cursor = decodeAuditCursor(args.cursor);
    if (cursor === 'invalid') {
      return { events: [] };
    }

    let query = this.db
      .selectFrom('fact_log')
      .where('entity_type', '=', AUDIT_ENTITY_TYPE)
      .where('entity_id', 'like', `${args.cooperativeDid}|%`)
      .selectAll();

    if (cursor) {
      query = query.where((eb) =>
        eb.or([
          eb('changed_at', '<', cursor.changedAt),
          eb.and([
            eb('changed_at', '=', cursor.changedAt),
            eb('id', '<', cursor.id),
          ]),
        ]),
      );
    }

    const rows = await query
      .orderBy('changed_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1)
      .execute();

    const pageRows = rows.slice(0, limit);
    const lastRow = pageRows.at(-1);
    return {
      events: pageRows.map(auditEventFromRow),
      cursor: rows.length > limit && lastRow ? encodeAuditCursor(lastRow) : undefined,
    };
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private invalidRoleResult(
    operation: GroupMutationOperation,
    cooperativeDid: DID,
    role: string,
    memberDid?: DID,
  ): GroupMutationResult {
    return {
      ok: false,
      changed: false,
      operation,
      cooperativeDid,
      memberDid,
      role,
      sourceRevision: this.now().toISOString(),
      reason: 'invalid-role',
    };
  }
}

async function runInTransaction<T>(
  db: MutationDb,
  fn: (trx: Transaction<Database>) => Promise<T>,
): Promise<T> {
  // Kysely's Transaction also has a `transaction` method (it throws when
  // called), so duck-typing on the method cannot distinguish a root Kysely
  // from an already-open transaction; `isTransaction` is the discriminator
  // Kysely provides for exactly this.
  if (db.isTransaction) {
    return fn(db as Transaction<Database>);
  }
  return db.transaction().execute(fn);
}

async function findOpenMembership(
  db: MutationDb,
  cooperativeDid: DID,
  memberDid: DID,
): Promise<MembershipRow | undefined> {
  return db
    .selectFrom('membership')
    .where('cooperative_did', '=', cooperativeDid)
    .where('member_did', '=', memberDid)
    .where('invalidated_at', 'is', null)
    .selectAll()
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst();
}

async function findActiveMembership(
  db: MutationDb,
  cooperativeDid: DID,
  memberDid: DID,
): Promise<MembershipRow | undefined> {
  return db
    .selectFrom('membership')
    .where('cooperative_did', '=', cooperativeDid)
    .where('member_did', '=', memberDid)
    .where('status', '=', 'active')
    .where('invalidated_at', 'is', null)
    .selectAll()
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst();
}

async function loadRoles(db: MutationDb, membershipId: string): Promise<ReadonlyArray<string>> {
  const rows = await db
    .selectFrom('membership_role')
    .where('membership_id', '=', membershipId)
    .select('role')
    .orderBy('role', 'asc')
    .execute();
  return rows.map((row) => row.role);
}

async function replaceRoles(
  db: MutationDb,
  membershipId: string,
  currentRoles: ReadonlyArray<string>,
  newRoles: ReadonlyArray<string>,
  now: Date,
): Promise<{ readonly changed: boolean; readonly oldRoles: ReadonlyArray<string>; readonly newRoles: ReadonlyArray<string> }> {
  if (sameStringSet(currentRoles, newRoles)) {
    return { changed: false, oldRoles: currentRoles, newRoles: currentRoles };
  }

  await db.deleteFrom('membership_role').where('membership_id', '=', membershipId).execute();
  if (newRoles.length > 0) {
    await db
      .insertInto('membership_role')
      .values(newRoles.map((role) => ({ membership_id: membershipId, role, indexed_at: now })))
      .execute();
  }
  return { changed: true, oldRoles: currentRoles, newRoles };
}

function buildMemberUpdate(
  existing: MembershipRow,
  args: AddMemberArgs,
  now: Date,
): Record<string, Date | string | boolean | null> {
  const update: Record<string, Date | string | boolean | null> = { indexed_at: now };
  const joinedAt = args.joinedAt ?? existing.joined_at ?? now;
  setIfChanged(update, 'status', existing.status, 'active');
  setIfChanged(update, 'joined_at', existing.joined_at, joinedAt);
  setIfChanged(update, 'departed_at', existing.departed_at, null);
  setIfChanged(update, 'status_reason', existing.status_reason, null);
  setIfChanged(update, 'invalidated_at', existing.invalidated_at, null);
  setIfChanged(update, 'invalidated_by', existing.invalidated_by, null);

  if (args.memberClass !== undefined) {
    setIfChanged(update, 'member_class', existing.member_class, args.memberClass);
  }
  if (args.directoryVisible !== undefined) {
    setIfChanged(update, 'directory_visible', existing.directory_visible, args.directoryVisible);
  }
  if (args.consentRecordUri !== undefined) {
    setIfChanged(update, 'member_record_uri', existing.member_record_uri, args.consentRecordUri);
  }
  if (args.consentRecordCid !== undefined) {
    setIfChanged(update, 'member_record_cid', existing.member_record_cid, args.consentRecordCid);
  }
  if (args.invitationId !== undefined) {
    setIfChanged(update, 'invitation_id', existing.invitation_id, args.invitationId);
  }

  if (Object.keys(update).length === 1) {
    return {};
  }
  return update;
}

function setIfChanged(
  update: Record<string, Date | string | boolean | null>,
  key: string,
  oldValue: Date | string | boolean | null,
  newValue: Date | string | boolean | null,
): void {
  if (dateAwareValue(oldValue) !== dateAwareValue(newValue)) {
    update[key] = newValue;
  }
}

function dateAwareValue(value: Date | string | boolean | null): string | boolean | null {
  return value instanceof Date ? value.toISOString() : value;
}

async function insertAuditEvent(
  db: MutationDb,
  event: {
    readonly cooperativeDid: DID;
    readonly operation: GroupMutationOperation;
    readonly actorDid: DID;
    readonly changedAt: Date;
    readonly memberDid?: DID;
    readonly role?: string;
    readonly oldValue: unknown;
    readonly newValue: unknown;
    readonly reason: string | null;
    readonly auditMetadata?: UnknownLexiconObject;
    readonly governanceOutcomeRef?: string;
  },
): Promise<string | undefined> {
  const [inserted] = await db
    .insertInto('fact_log')
    .values({
      entity_type: AUDIT_ENTITY_TYPE,
      entity_id: auditEntityId(event.cooperativeDid, event.operation, event.memberDid ?? event.role),
      field: event.operation,
      old_value: event.oldValue,
      new_value: {
        ...objectValue(event.newValue),
        cooperativeDid: event.cooperativeDid,
        operation: event.operation,
        actorDid: event.actorDid,
        memberDid: event.memberDid,
        role: event.role,
        auditMetadata: event.auditMetadata,
        governanceOutcomeRef: event.governanceOutcomeRef,
      },
      changed_by: event.actorDid,
      changed_at: event.changedAt,
      reason: event.reason,
      ip_address: null,
    })
    .returning('id')
    .execute();
  return inserted?.id;
}

function memberAuditValue(row: MembershipRow, roles: ReadonlyArray<string>): Record<string, unknown> {
  return {
    memberDid: row.member_did,
    status: row.status,
    roles,
    memberClass: row.member_class,
    directoryVisible: row.directory_visible,
    consentRecordUri: row.member_record_uri,
    consentRecordCid: row.member_record_cid,
    joinedAt: row.joined_at?.toISOString() ?? null,
    departedAt: row.departed_at?.toISOString() ?? null,
    invalidatedAt: row.invalidated_at?.toISOString() ?? null,
  };
}

function roleResult(
  operation: GroupMutationOperation,
  cooperativeDid: DID,
  memberDid: DID,
  role: string,
  changed: boolean,
  now: Date,
  reason?: GroupMutationFailureReason,
  auditEventId?: string,
  ok: boolean = reason ? false : true,
): GroupMutationResult {
  return {
    ok,
    changed,
    operation,
    cooperativeDid,
    memberDid,
    role,
    space: roleSpace(cooperativeDid, role),
    sourceRevision: now.toISOString(),
    reason,
    auditEventId,
  };
}

function normalizeRole(role: string): string | null {
  const normalized = role.trim();
  return normalized.length === 0 ? null : normalized;
}

function normalizeRoles(roles: ReadonlyArray<string>): { readonly roles: ReadonlyArray<string>; readonly invalid?: string } {
  const normalized = new Set<string>();
  for (const role of roles) {
    const normalizedRole = normalizeRole(role);
    if (!normalizedRole) {
      return { roles: [], invalid: role };
    }
    normalized.add(normalizedRole);
  }
  return { roles: [...normalized].sort() };
}

function sameStringSet(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  return right.every((value) => leftSet.has(value));
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function auditEntityId(cooperativeDid: DID, operation: GroupMutationOperation, subject: string | undefined): string {
  return `${cooperativeDid}|${operation}|${subject ?? ''}`;
}

function clampLimit(limit: number | undefined): number {
  return Math.min(MAX_AUDIT_LIMIT, Math.max(1, limit ?? DEFAULT_AUDIT_LIMIT));
}

function encodeAuditCursor(row: FactLogRow): string {
  return [
    AUDIT_CURSOR_PREFIX,
    encodeURIComponent(row.changed_at.toISOString()),
    encodeURIComponent(row.id),
  ].join('|');
}

function decodeAuditCursor(cursor: string | undefined): { readonly changedAt: Date; readonly id: string } | null | 'invalid' {
  if (!cursor) return null;
  const [prefix, changedAt, id] = cursor.split('|');
  if (prefix !== AUDIT_CURSOR_PREFIX || !changedAt || !id) {
    return 'invalid';
  }
  const date = new Date(decodeURIComponent(changedAt));
  if (Number.isNaN(date.valueOf())) {
    return 'invalid';
  }
  return { changedAt: date, id: decodeURIComponent(id) };
}

function auditEventFromRow(row: FactLogRow): GroupMutationAuditEvent {
  const oldValue = parseAuditValue(row.old_value);
  const newValue = parseAuditValue(row.new_value);
  const newObject = objectValue(newValue);
  const cooperativeDid = typeof newObject.cooperativeDid === 'string'
    ? (newObject.cooperativeDid as DID)
    : (row.entity_id.split('|')[0] as DID);

  return {
    id: row.id,
    cooperativeDid,
    operation: row.field as GroupMutationOperation,
    actorDid: row.changed_by as DID | null,
    memberDid: typeof newObject.memberDid === 'string' ? (newObject.memberDid as DID) : undefined,
    role: typeof newObject.role === 'string' ? newObject.role : undefined,
    changedAt: row.changed_at,
    oldValue,
    newValue,
    reason: row.reason,
    auditMetadata: objectValue(newValue).auditMetadata as UnknownLexiconObject | undefined,
    governanceOutcomeRef: typeof objectValue(newValue).governanceOutcomeRef === 'string'
      ? objectValue(newValue).governanceOutcomeRef as string
      : undefined,
  };
}

function parseAuditValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
