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
 * cooperative-defined custom roles too: an actor may only grant roles whose
 * effective permissions they already hold themselves. Self-promotion falls out
 * of the same rule — a coordinator's own permissions cannot contain `admin`'s.
 */
export async function assertRolesAssignable(args: {
  readonly db: Kysely<Database>;
  readonly cooperativeDid: string;
  readonly actorRoles: readonly string[];
  readonly requestedRoles: readonly string[];
}): Promise<void> {
  const { db, cooperativeDid, actorRoles, requestedRoles } = args;

  if (requestedRoles.length === 0) return;

  const defined = await db
    .selectFrom('role_definition')
    .where('cooperative_did', '=', cooperativeDid)
    .select('name')
    .execute();
  const known = new Set(defined.map((row) => row.name));

  const unknown = requestedRoles.filter((role) => !known.has(role));
  if (unknown.length > 0) {
    throw new ValidationError(`Unknown role(s): ${[...new Set(unknown)].sort().join(', ')}`);
  }

  const actorPermissions = await resolveRolePermissions(db, cooperativeDid, actorRoles);
  if (actorPermissions.has('*')) return;

  const requestedPermissions = await resolveRolePermissions(db, cooperativeDid, requestedRoles);
  const exceeded = [...requestedPermissions].filter(
    (permission) => !actorPermissions.has(permission),
  );

  if (exceeded.length > 0) {
    throw new ForbiddenError(
      'Cannot assign a role with permissions beyond your own: ' +
        exceeded.sort().join(', '),
    );
  }
}
