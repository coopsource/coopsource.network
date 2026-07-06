import type { RequestHandler } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { Permission } from '@coopsource/common';
import { resolveRolePermissions } from '../services/role-permissions.js';

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
  return resolveRolePermissions(db, cooperativeDid, roleNames);
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
