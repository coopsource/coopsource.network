import type { DID } from '@coopsource/common';
import type { SpaceRef } from '@coopsource/spaces-consumer';

export const MEMBERS_SPACE_TYPE = 'network.coopsource.org.cooperative';
export const MEMBERS_SPACE_SKEY = 'members';
export const ROLE_SPACE_TYPE = 'network.coopsource.org.role';

export type CsnSpace =
  | {
      readonly kind: 'members';
      readonly cooperativeDid: DID;
    }
  | {
      readonly kind: 'role';
      readonly cooperativeDid: DID;
      readonly role: string;
    };

export function membersSpace(cooperativeDid: DID): SpaceRef {
  return {
    arbiter: cooperativeDid,
    type: MEMBERS_SPACE_TYPE,
    skey: MEMBERS_SPACE_SKEY,
  };
}

export function roleSpace(cooperativeDid: DID, role: string): SpaceRef {
  const skey = role.trim();
  if (skey.length === 0) {
    throw new Error('roleSpace requires a non-empty role skey');
  }

  return {
    arbiter: cooperativeDid,
    type: ROLE_SPACE_TYPE,
    skey,
  };
}

export function parseCsnSpace(space: SpaceRef): CsnSpace | null {
  if (space.type === MEMBERS_SPACE_TYPE && space.skey === MEMBERS_SPACE_SKEY) {
    return {
      kind: 'members',
      cooperativeDid: space.arbiter,
    };
  }

  if (space.type === ROLE_SPACE_TYPE && space.skey.trim().length > 0) {
    return {
      kind: 'role',
      cooperativeDid: space.arbiter,
      role: space.skey,
    };
  }

  return null;
}
