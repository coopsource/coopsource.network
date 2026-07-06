import {
  CSN_SPACE_PLACEMENT_MATRIX,
  type CsnSpacePlacement,
} from './space-placement.js';
import {
  formatSpaceReadScope,
  formatSpaceReadSelfScope,
} from './space-scopes.js';

export type CsnScopePlanSkeyMode = 'omit' | 'canonical-or-wildcard';

export interface CsnSpaceScopePlanOptions {
  readonly authority?: string;
  readonly skeyMode?: CsnScopePlanSkeyMode;
  readonly collections?: readonly string[];
}

export function formatCsnAppViewReadScopePlan(
  options: CsnSpaceScopePlanOptions = {},
): readonly string[] {
  return placementsForPlan(options).map((placement) =>
    formatSpaceReadScope(placement.spaceType, {
      authority: options.authority,
      skey: skeyForPlacement(placement, options.skeyMode),
      collections: [placement.collection],
    }),
  );
}

export function formatCsnMemberSelfReadScopePlan(
  options: CsnSpaceScopePlanOptions = {},
): readonly string[] {
  return placementsForPlan(options).map((placement) =>
    formatSpaceReadSelfScope(placement.spaceType, {
      authority: options.authority,
      skey: skeyForPlacement(placement, options.skeyMode),
      collections: [placement.collection],
    }),
  );
}

function placementsForPlan(
  options: CsnSpaceScopePlanOptions,
): readonly CsnSpacePlacement[] {
  if (!options.collections) return CSN_SPACE_PLACEMENT_MATRIX;
  const requested = new Set(options.collections);
  const placements = CSN_SPACE_PLACEMENT_MATRIX.filter((placement) =>
    requested.has(placement.collection),
  );
  const placed = new Set(placements.map((placement) => placement.collection));
  const missing = [...requested].filter(
    (collection) => !placed.has(collection),
  );
  if (missing.length > 0) {
    throw new Error(
      `Unknown CSN space placement collection: ${missing.join(', ')}`,
    );
  }
  return placements;
}

function skeyForPlacement(
  placement: CsnSpacePlacement,
  mode: CsnScopePlanSkeyMode = 'canonical-or-wildcard',
): string | undefined {
  if (mode === 'omit') return undefined;
  return placement.skeyPattern === 'members' ? 'members' : '*';
}
