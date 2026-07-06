import type { DID } from '@coopsource/common';
import type { SpaceRef } from '@coopsource/spaces-consumer';

export const MEMBERS_SPACE_TYPE = 'network.coopsource.org.spaceType.members';
export const MEMBERS_SPACE_KEY = 'members';
export const ROLE_SPACE_TYPE = 'network.coopsource.org.spaceType.role';
export const CLASS_SPACE_TYPE = 'network.coopsource.org.spaceType.memberClass';

export type CsnSpace =
  | {
      readonly kind: 'members';
      readonly cooperativeDid: DID;
    }
  | {
      readonly kind: 'role';
      readonly cooperativeDid: DID;
      readonly role: string;
    }
  | {
      readonly kind: 'class';
      readonly cooperativeDid: DID;
      readonly memberClass: string;
    };

export function membersSpace(cooperativeDid: DID): SpaceRef {
  return {
    arbiterDid: cooperativeDid,
    spaceKey: MEMBERS_SPACE_KEY,
    expectedSpaceType: MEMBERS_SPACE_TYPE,
  };
}

export function roleSpace(cooperativeDid: DID, role: string): SpaceRef {
  const spaceKey = normalizeRoleSpaceKey(role);
  if (!spaceKey) {
    throw new Error('roleSpace requires a non-empty role key');
  }

  return {
    arbiterDid: cooperativeDid,
    spaceKey,
    expectedSpaceType: spaceKey.startsWith('classes/')
      ? CLASS_SPACE_TYPE
      : ROLE_SPACE_TYPE,
  };
}

export function parseCsnSpace(space: SpaceRef): CsnSpace | null {
  if (space.spaceKey === MEMBERS_SPACE_KEY) {
    if (!matchesExpectedSpaceType(space, MEMBERS_SPACE_TYPE)) return null;
    return {
      kind: 'members',
      cooperativeDid: space.arbiterDid,
    };
  }

  const role = parseRoleSpaceKey(space.spaceKey);
  if (role) {
    if (!matchesExpectedSpaceType(space, ROLE_SPACE_TYPE)) return null;
    return {
      kind: 'role',
      cooperativeDid: space.arbiterDid,
      role,
    };
  }

  const memberClass = parseClassSpaceKey(space.spaceKey);
  if (memberClass) {
    if (!matchesExpectedSpaceType(space, CLASS_SPACE_TYPE)) return null;
    return {
      kind: 'class',
      cooperativeDid: space.arbiterDid,
      memberClass,
    };
  }

  return null;
}

export function csnSpaceType(space: CsnSpace): string {
  if (space.kind === 'members') return MEMBERS_SPACE_TYPE;
  if (space.kind === 'role') return ROLE_SPACE_TYPE;
  return CLASS_SPACE_TYPE;
}

function matchesExpectedSpaceType(space: SpaceRef, actual: string): boolean {
  return !space.expectedSpaceType || space.expectedSpaceType === actual;
}

function normalizeRoleSpaceKey(role: string): string | null {
  const normalized = role.trim().replace(/^\/+|\/+$/g, '');
  if (!normalized) return null;
  if (normalized.startsWith('roles/') || normalized.startsWith('classes/')) {
    return normalized;
  }
  if (normalized.startsWith('custom/')) {
    return `roles/${normalized}`;
  }
  return `roles/${normalized}`;
}

function parseRoleSpaceKey(spaceKey: string): string | null {
  if (spaceKey.startsWith('roles/custom/')) {
    const role = spaceKey.slice('roles/custom/'.length).trim();
    return role ? `custom/${role}` : null;
  }
  if (spaceKey.startsWith('roles/')) {
    const role = spaceKey.slice('roles/'.length).trim();
    return role ? role : null;
  }
  return null;
}

function parseClassSpaceKey(spaceKey: string): string | null {
  if (!spaceKey.startsWith('classes/')) return null;
  const memberClass = spaceKey.slice('classes/'.length).trim();
  return memberClass || null;
}
