import type { RequestHandler } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';

export interface Actor {
  did: string;
  displayName: string;
  roles: string[];
  cooperativeDid: string;
  membershipId: string;
  hasRole: (...roles: string[]) => boolean;
}

declare global {
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

// Database reference — set by container init
let _db: Kysely<Database>;

export function setDb(db: Kysely<Database>): void {
  _db = db;
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

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const did = req.session?.did;
    if (!did) {
      res
        .status(401)
        .json({
          error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        });
      return;
    }

    // Look up entity + active membership + roles
    const entity = await _db
      .selectFrom('entity')
      .where('did', '=', did)
      .where('status', '=', 'active')
      .select(['did', 'display_name'])
      .executeTakeFirst();

    if (!entity) {
      req.session.destroy(() => {});
      res
        .status(401)
        .json({
          error: { code: 'UNAUTHORIZED', message: 'Account not found' },
        });
      return;
    }

    const membership = await _db
      .selectFrom('membership')
      .where('member_did', '=', did)
      .where('status', '=', 'active')
      .where('invalidated_at', 'is', null)
      .select(['id', 'cooperative_did'])
      .executeTakeFirst();

    if (!membership) {
      res
        .status(401)
        .json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'No active membership',
          },
        });
      return;
    }

    const roleRows = await _db
      .selectFrom('membership_role')
      .where('membership_id', '=', membership.id)
      .select('role')
      .execute();

    const roles = roleRows.map((r) => r.role);

    req.actor = {
      did: entity.did,
      displayName: entity.display_name,
      roles,
      cooperativeDid: membership.cooperative_did,
      membershipId: membership.id,
      hasRole: (...check: string[]) =>
        check.some((r) => roles.includes(r)),
    };

    next();
  } catch {
    res
      .status(401)
      .json({
        error: { code: 'UNAUTHORIZED', message: 'Session invalid' },
      });
  }
};

export const requireMember: RequestHandler = requireAuth;

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
