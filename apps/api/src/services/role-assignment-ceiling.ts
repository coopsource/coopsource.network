import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { ForbiddenError, ValidationError } from '@coopsource/common';
import { resolveRolePermissions } from './role-permissions.js';

/**
 * Guard against privilege escalation through role assignment (audit S-01).
 *
 * `member.roles.assign` is held by `coordinator`, and the assignment paths
 * accepted arbitrary role strings for any member including the caller, so a
 * coordinator could grant themselves `admin` or `owner` — both of which carry
 * the `*` wildcard.
 *
 * The rule is a subset check rather than a fixed role ranking, so it holds for
 * cooperative-defined custom roles too: an actor may only assign roles whose
 * effective permissions they already hold. Self-promotion falls out of the same
 * rule — a coordinator's own permissions cannot contain `admin`'s.
 *
 * The check covers the target's *current* roles as well as the requested ones.
 * Guarding only what is granted leaves the mirror-image attack open: rather
 * than promoting yourself over an owner, strip the owner instead. The effect on
 * who controls the cooperative is the same, and an empty `roles` array made it
 * a single request.
 */
export async function assertRolesAssignable(args: {
  readonly db: Kysely<Database>;
  readonly cooperativeDid: string;
  readonly actorRoles: readonly string[];
  readonly currentRoles: readonly string[];
  readonly requestedRoles: readonly string[];
}): Promise<void> {
  const { db, cooperativeDid, actorRoles, currentRoles, requestedRoles } = args;

  if (requestedRoles.length === 0 && currentRoles.length === 0) return;

  const defined = await db
    .selectFrom('role_definition')
    .where('cooperative_did', '=', cooperativeDid)
    .select('name')
    .execute();
  const known = new Set(defined.map((row) => row.name));

  // Only the requested roles have to be nameable. An unrecognised role already
  // persisted on the target must still be accounted for below, not rejected.
  const unknown = requestedRoles.filter((role) => !known.has(role));
  if (unknown.length > 0) {
    throw new ValidationError(`Unknown role(s): ${[...new Set(unknown)].sort().join(', ')}`);
  }

  const actorPermissions = await resolveRolePermissions(db, cooperativeDid, actorRoles);
  if (actorPermissions.has('*')) return;

  const affectedPermissions = await resolveRolePermissions(db, cooperativeDid, [
    ...new Set([...requestedRoles, ...currentRoles]),
  ]);
  const exceeded = [...affectedPermissions].filter(
    (permission) => !actorPermissions.has(permission),
  );

  if (exceeded.length > 0) {
    throw new ForbiddenError(
      'Cannot change roles carrying permissions beyond your own: ' + exceeded.sort().join(', '),
    );
  }
}

/**
 * Roles currently held in the cooperative, whatever the membership's status —
 * a pending or suspended member's roles still bound what an actor may change.
 */
export async function loadCurrentMemberRoles(
  db: Kysely<Database>,
  cooperativeDid: string,
  memberDid: string,
): Promise<string[]> {
  const rows = await db
    .selectFrom('membership')
    .innerJoin('membership_role', 'membership_role.membership_id', 'membership.id')
    .where('membership.cooperative_did', '=', cooperativeDid)
    .where('membership.member_did', '=', memberDid)
    .where('membership.invalidated_at', 'is', null)
    .select('membership_role.role')
    .execute();

  return [...new Set(rows.map((row) => row.role))];
}
