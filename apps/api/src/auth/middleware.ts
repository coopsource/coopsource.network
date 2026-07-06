import type { RequestHandler } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { DID } from '@coopsource/common';
import {
  membershipAuthorityErrorCode,
  membershipAuthorityFailure,
  membershipAuthorityHttpStatus,
  type MembershipReadModel,
} from '../services/membership-read-model.js';

export interface Actor {
  did: string;
  displayName: string;
  roles: string[];
  cooperativeDid: string;
  membershipId: string;
  hasRole: (...roles: string[]) => boolean;
}

export interface Viewer {
  did: string;
  displayName: string;
}

declare global {
  namespace Express {
    interface Request {
      actor?: Actor;
      viewer?: Viewer;
    }
  }
}

// Database reference — set by container init
let _db: Kysely<Database>;
let _membershipReadModel: MembershipReadModel | undefined;

export function setDb(db: Kysely<Database>): void {
  _db = db;
}

export function setMembershipReadModel(readModel: MembershipReadModel): void {
  _membershipReadModel = readModel;
}

// Setup-complete cache
let _setupComplete: boolean | null = null;

export async function checkSetupComplete(
  db: Kysely<Database>,
): Promise<boolean> {
  if (_setupComplete !== null) return _setupComplete;
  const row = await db
    .selectFrom('system_config')
    .where('key', '=', 'setup_complete')
    .select('value')
    .executeTakeFirst();
  _setupComplete = row != null;
  return _setupComplete;
}

export function markSetupComplete(): void {
  _setupComplete = true;
}

export function resetSetupCache(): void {
  _setupComplete = null;
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const did = req.session?.did;
    if (!did) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
      return;
    }

    // Look up entity first to preserve the current account-not-found response.
    const entity = await _db
      .selectFrom('entity')
      .where('did', '=', did)
      .where('status', '=', 'active')
      .select(['did', 'display_name'])
      .executeTakeFirst();

    if (!entity) {
      req.session.destroy(() => {});
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Account not found' },
      });
      return;
    }

    const actorMembership = _membershipReadModel
      ? await _membershipReadModel.getPrimaryActorMembershipResult(did as DID)
      : membershipAuthorityFailure(
          'unavailable',
          'Membership authority is unavailable',
        );
    if (!actorMembership.ok) {
      const status = membershipAuthorityHttpStatus(actorMembership, 401);
      res.status(status).json({
        error: {
          code: membershipAuthorityErrorCode(actorMembership, 'UNAUTHORIZED'),
          message:
            actorMembership.reason === 'not-member'
              ? 'No active membership'
              : actorMembership.message,
          axis: actorMembership.axis,
          reason: actorMembership.reason,
        },
      });
      return;
    }

    const roles = [...actorMembership.membership.roles];

    req.actor = {
      did: entity.did,
      displayName: actorMembership.membership.displayName,
      roles,
      cooperativeDid: actorMembership.membership.cooperativeDid,
      membershipId: actorMembership.membership.membershipId,
      hasRole: (...check: string[]) => check.some((r) => roles.includes(r)),
    };

    next();
  } catch {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Session invalid' },
    });
  }
};

export const requireMember: RequestHandler = requireAuth;

export const requireViewer: RequestHandler = async (req, res, next) => {
  try {
    const did = req.session?.did;
    if (!did) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
      return;
    }

    const entity = await _db
      .selectFrom('entity')
      .where('did', '=', did)
      .where('status', '=', 'active')
      .select(['did', 'display_name'])
      .executeTakeFirst();

    if (!entity) {
      req.session.destroy(() => {});
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Account not found' },
      });
      return;
    }

    req.viewer = {
      did: entity.did,
      displayName: entity.display_name,
    };

    next();
  } catch {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Session invalid' },
    });
  }
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.actor?.hasRole('admin', 'owner')) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
    });
    return;
  }
  next();
};

export const requireSetup: RequestHandler = async (_req, res, next) => {
  const ok = await checkSetupComplete(_db);
  if (!ok) {
    res.status(503).json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Setup not complete',
      },
    });
    return;
  }
  next();
};
