import {
  CSN_MEMBER_CLASS_SPACE_TYPE,
  CSN_MEMBERS_SPACE_TYPE,
  CSN_ROLE_SPACE_TYPE,
  CSN_SPACE_TYPE_DECLARATIONS,
} from './space-types.js';
import {
  formatSpaceReadScope,
  formatSpaceReadSelfScope,
} from './space-scopes.js';

export type CsnSpaceTypeId =
  | typeof CSN_MEMBERS_SPACE_TYPE
  | typeof CSN_ROLE_SPACE_TYPE
  | typeof CSN_MEMBER_CLASS_SPACE_TYPE;

export type CsnSpacePlacementKind = 'members' | 'role' | 'memberClass';

export type CsnSpaceSkeyPattern =
  | 'members'
  | 'roles/{role}'
  | 'classes/{memberClass}';

export interface CsnSpacePlacement {
  readonly collection: string;
  readonly spaceType: CsnSpaceTypeId;
  readonly spaceKind: CsnSpacePlacementKind;
  readonly skeyPattern: CsnSpaceSkeyPattern;
  readonly appViewReadAction: 'read';
  readonly memberSelfReadAction: 'read_self';
  readonly status: 'draft-phase-4';
}

export interface PlacementScopeOptions {
  readonly authority?: string;
  readonly skey?: string;
}

const declarationsById = new Map(
  CSN_SPACE_TYPE_DECLARATIONS.map((declaration) => [
    declaration.id,
    declaration,
  ]),
);

export const CSN_SPACE_PLACEMENT_MATRIX = [
  ...placementsFor(CSN_MEMBERS_SPACE_TYPE, 'members', 'members'),
  ...placementsFor(CSN_ROLE_SPACE_TYPE, 'role', 'roles/{role}'),
  ...placementsFor(
    CSN_MEMBER_CLASS_SPACE_TYPE,
    'memberClass',
    'classes/{memberClass}',
  ),
] as const satisfies readonly CsnSpacePlacement[];

export function findCsnSpacePlacement(
  collection: string,
): CsnSpacePlacement | null {
  return (
    CSN_SPACE_PLACEMENT_MATRIX.find(
      (placement) => placement.collection === collection,
    ) ?? null
  );
}

/**
 * Whether a collection is confidential by declaration and may therefore never
 * be written to a public repo, whatever the cooperative's governance
 * visibility says (ARCHITECTURE-V12 §8, Tier 2: "Never on the public
 * firehose"; audit finding C-03).
 *
 * Members-space collections — proposals, votes, agreements, signatures,
 * consent — are the governance record set whose visibility a cooperative
 * legitimately chooses. Role- and member-class-scoped collections are not:
 * they carry financials, legal documents, member notices, stakeholder terms,
 * and time entries, which are Tier 2 regardless of that choice.
 */
export function isConfidentialCsnCollection(collection: string): boolean {
  const placement = findCsnSpacePlacement(collection);
  return placement !== null && placement.spaceKind !== 'members';
}

export function formatPlacementAppViewReadScope(
  placement: CsnSpacePlacement,
  options: Required<PlacementScopeOptions>,
): string {
  return formatSpaceReadScope(placement.spaceType, {
    authority: options.authority,
    skey: options.skey,
    collections: [placement.collection],
  });
}

export function formatPlacementMemberSelfReadScope(
  placement: CsnSpacePlacement,
  options: PlacementScopeOptions = {},
): string {
  return formatSpaceReadSelfScope(placement.spaceType, {
    authority: options.authority,
    skey: options.skey,
    collections: [placement.collection],
  });
}

function placementsFor(
  spaceType: CsnSpaceTypeId,
  spaceKind: CsnSpacePlacementKind,
  skeyPattern: CsnSpaceSkeyPattern,
): readonly CsnSpacePlacement[] {
  const declaration = declarationsById.get(spaceType);
  if (!declaration) {
    throw new Error(`Missing CSN space type declaration: ${spaceType}`);
  }
  return declaration.defs.main.collections.map((collection) => ({
    collection,
    spaceType,
    spaceKind,
    skeyPattern,
    appViewReadAction: 'read',
    memberSelfReadAction: 'read_self',
    status: 'draft-phase-4',
  }));
}
