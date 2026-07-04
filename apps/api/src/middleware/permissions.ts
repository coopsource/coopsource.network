import type { RequestHandler } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { Permission } from '@coopsource/common';

// Database reference — set by container init (shared with auth middleware)
let _db: Kysely<Database>;

export function setPermissionsDb(db: Kysely<Database>): void {
  _db = db;
}

/**
 * Resolve the full set of permissions for the given role names,
 * including permissions inherited through role chains.
 */
export async function resolvePermissions(
  db: Kysely<Database>,
  cooperativeDid: string,
  roleNames: string[],
): Promise<Set<string>> {
  // Fetch all role definitions for this cooperative
  const allRoles = await db
    .selectFrom('role_definition')
    .where('cooperative_did', '=', cooperativeDid)
    .select(['name', 'permissions', 'inherits'])
    .execute();

  const roleMap = new Map(allRoles.map((r) => [r.name, r]));
  const resolved = new Set<string>();
  const visited = new Set<string>();

  function collect(roleName: string): void {
    if (visited.has(roleName)) return;
    visited.add(roleName);

    const def = roleMap.get(roleName);
    if (!def) return;

    for (const perm of def.permissions) {
      resolved.add(perm);
    }

    for (const parent of def.inherits) {
      collect(parent);
    }
  }

  for (const name of roleNames) {
    collect(name);
  }

  return resolved;
}

/**
 * Does `did` hold `permission` in `cooperativeDid`, via its active-membership
 * roles (resolved through role inheritance and the `'*'` wildcard)?
 *
 * Identity-first authority check for callers that are not a request `actor`
 * — e.g. a verified federation peer signer, or the cooperative acting as
 * itself. Centralizes the "who may do X" decision on the same role_definition
 * model `requirePermission` uses, so no endpoint hardcodes role names.
 */
export async function didHasPermission(
  db: Kysely<Database>,
  cooperativeDid: string,
  did: string,
  permission: Permission,
): Promise<boolean> {
  const roleRows = await db
    .selectFrom('membership')
    .innerJoin(
      'membership_role',
      'membership_role.membership_id',
      'membership.id',
    )
    .where('membership.cooperative_did', '=', cooperativeDid)
    .where('membership.member_did', '=', did)
    .where('membership.status', '=', 'active')
    .where('membership.invalidated_at', 'is', null)
    .select('membership_role.role')
    .execute();
  if (roleRows.length === 0) return false;
  const perms = await resolvePermissions(
    db,
    cooperativeDid,
    roleRows.map((r) => r.role),
  );
  return perms.has('*') || perms.has(permission);
}

/**
 * Middleware factory that checks whether the authenticated user
 * has a specific permission. Must run AFTER requireAuth.
 *
 * Admin role with '*' permission grants everything.
 * Returns 403 if the permission is not found.
 */
export function requirePermission(permission: Permission): RequestHandler {
  return async (req, res, next) => {
    if (!req.actor) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
      return;
    }

    try {
      const permissions = await resolvePermissions(
        _db,
        req.actor.cooperativeDid,
        req.actor.roles,
      );

      // Wildcard grants everything
      if (permissions.has('*') || permissions.has(permission)) {
        next();
        return;
      }

      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
          required: permission,
        },
      });
    } catch {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Permission check failed' },
      });
    }
  };
}
