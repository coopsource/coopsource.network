import type { RequestHandler } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { AppError, type DID, type Permission } from '@coopsource/common';
import { membersSpace } from '@coopsource/arbiter-client';
import type { ActionAuthorizerPlugin } from '@coopsource/governance-view';
import { resolveRolePermissions } from '../services/role-permissions.js';

// Database reference — set by container init (shared with auth middleware)
let _db: Kysely<Database>;
let _permissionAuthorizer: ActionAuthorizerPlugin | undefined;

export function setPermissionsDb(db: Kysely<Database>): void {
  _db = db;
}

export function setPermissionAuthorizer(
  authorizer: ActionAuthorizerPlugin,
): void {
  _permissionAuthorizer = authorizer;
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
      if (!_permissionAuthorizer) {
        res.status(500).json({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Permission authorizer is not configured',
          },
        });
        return;
      }

      const memberSpace = membersSpace(req.actor.cooperativeDid as DID);
      const decision = await _permissionAuthorizer.authorize({
        actor: { did: req.actor.did },
        cooperative: {
          authorityDid: req.actor.cooperativeDid,
          spaceKey: memberSpace.spaceKey,
          spaceType: memberSpace.expectedSpaceType,
        },
        action: permission,
        at: new Date().toISOString(),
      });

      if (decision.authorized) {
        next();
        return;
      }

      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
          required: permission,
          reason: decision.reason,
        },
      });
    } catch (err) {
      if (err instanceof AppError) {
        const extra = err as AppError & {
          readonly axis?: string;
          readonly reason?: string;
        };
        res.status(err.statusCode).json({
          error: {
            code: err.code,
            message: err.message,
            ...(extra.axis ? { axis: extra.axis } : {}),
            ...(extra.reason ? { reason: extra.reason } : {}),
          },
        });
        return;
      }

      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Permission check failed' },
      });
    }
  };
}
