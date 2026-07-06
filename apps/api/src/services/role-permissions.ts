import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';

/**
 * Resolve the full set of permissions for the given role names, including
 * permissions inherited through role chains.
 */
export async function resolveRolePermissions(
  db: Kysely<Database>,
  cooperativeDid: string,
  roleNames: readonly string[],
): Promise<Set<string>> {
  const allRoles = await db
    .selectFrom('role_definition')
    .where('cooperative_did', '=', cooperativeDid)
    .select(['name', 'permissions', 'inherits'])
    .execute();

  const roleMap = new Map(allRoles.map((role) => [role.name, role]));
  const resolved = new Set<string>();
  const visited = new Set<string>();

  function collect(roleName: string): void {
    if (visited.has(roleName)) return;
    visited.add(roleName);

    const role = roleMap.get(roleName);
    if (!role) return;

    for (const permission of role.permissions) {
      resolved.add(permission);
    }

    for (const parent of role.inherits) {
      collect(parent);
    }
  }

  for (const roleName of roleNames) {
    collect(roleName);
  }

  return resolved;
}
