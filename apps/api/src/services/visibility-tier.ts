import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { Actor } from '../auth/middleware.js';

/**
 * V8.1 — Visibility Tier
 *
 * Resolves the requesting user's access tier for a given resource. Used by
 * endpoints that return cooperative data to filter what's visible based on
 * the requester's relationship to the cooperative.
 *
 * Tiers (lowest to highest):
 *   - anonymous: no auth
 *   - authenticated: logged in, but not a member of the requested coop
 *   - cross-coop: logged in, member of a DIFFERENT coop
 *   - member: active member of the requested coop
 *   - officer: member with officer/admin role
 *   - owner: member with owner role
 *
 * Higher tiers automatically have access to data they would have at lower tiers.
 * The 'cross-coop' tier sits between authenticated and member because it can
 * grant slightly more access (e.g., a coop may share data with other coops'
 * members but not with anonymous users).
 *
 * NAMING NOTE: This file is distinct from `visibility-router.ts` which handles
 * record storage routing (Tier 1 public vs Tier 2 private data tiers). This file
 * handles request-time access tier resolution.
 */

export type VisibilityTier =
  | 'anonymous'
  | 'authenticated'
  | 'cross-coop'
  | 'member'
  | 'officer'
  | 'owner';

export interface VisibilityContext {
  tier: VisibilityTier;
  userDid?: string;
  cooperativeDid?: string;
  roles?: string[];
}

interface ResolveOptions {
  actor: Actor | undefined;
  cooperativeDid?: string; // The coop being accessed; undefined for non-coop endpoints
}

/**
 * Resolve the requesting user's visibility tier.
 *
 * - actor undefined → anonymous
 * - actor present, no cooperativeDid → authenticated
 * - actor present, cooperativeDid matches actor.cooperativeDid → check roles → member/officer/owner
 * - actor present, cooperativeDid different from actor.cooperativeDid → cross-coop
 *
 * Note: this resolver inspects the Actor object only — it does NOT make additional
 * DB queries unless we need to verify membership in a different coop than the
 * actor's primary cooperativeDid. For V8.1, we use the simple rule: actor's primary
 * coop matches the requested coop → member, otherwise cross-coop. Multi-coop
 * membership lookups are deferred until needed.
 */
export async function resolveVisibilityTier(
  _db: Kysely<Database>,
  options: ResolveOptions,
): Promise<VisibilityContext> {
  const { actor, cooperativeDid } = options;

  if (!actor) {
    return { tier: 'anonymous', cooperativeDid };
  }

  if (!cooperativeDid) {
    return {
      tier: 'authenticated',
      userDid: actor.did,
      roles: actor.roles,
    };
  }

  if (actor.cooperativeDid === cooperativeDid) {
    const roles = actor.roles;
    let tier: VisibilityTier = 'member';
    if (roles.includes('owner')) {
      tier = 'owner';
    } else if (roles.includes('admin') || roles.includes('officer')) {
      tier = 'officer';
    }
    return {
      tier,
      userDid: actor.did,
      cooperativeDid,
      roles,
    };
  }

  return {
    tier: 'cross-coop',
    userDid: actor.did,
    cooperativeDid,
    roles: actor.roles,
  };
}

/**
 * Helper: returns true if the given tier is at or above the threshold.
 * Useful for short-circuit checks like `if (tierAtLeast(ctx, 'member'))`.
 */
const TIER_ORDER: Record<VisibilityTier, number> = {
  anonymous: 0,
  authenticated: 1,
  'cross-coop': 2,
  member: 3,
  officer: 4,
  owner: 5,
};

export function tierAtLeast(
  ctx: { tier: VisibilityTier },
  threshold: VisibilityTier,
): boolean {
  return TIER_ORDER[ctx.tier] >= TIER_ORDER[threshold];
}
