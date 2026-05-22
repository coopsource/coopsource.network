import { describe, expect, it } from 'vitest';
import type { DID } from '@coopsource/common';
import {
  CLASS_SPACE_TYPE,
  MEMBERS_SPACE_KEY,
  MEMBERS_SPACE_TYPE,
  ROLE_SPACE_TYPE,
  membersSpace,
  parseCsnSpace,
  roleSpace,
} from '../index.js';

const cooperativeDid = 'did:plc:coop' as DID;

describe('CSN space helpers', () => {
  it('builds the canonical members space reference', () => {
    expect(membersSpace(cooperativeDid)).toEqual({
      arbiterDid: cooperativeDid,
      spaceKey: MEMBERS_SPACE_KEY,
      expectedSpaceType: MEMBERS_SPACE_TYPE,
    });
  });

  it('builds canonical role and class space references', () => {
    expect(roleSpace(cooperativeDid, 'admin')).toEqual({
      arbiterDid: cooperativeDid,
      spaceKey: 'roles/admin',
      expectedSpaceType: ROLE_SPACE_TYPE,
    });
    expect(roleSpace(cooperativeDid, 'classes/worker')).toEqual({
      arbiterDid: cooperativeDid,
      spaceKey: 'classes/worker',
      expectedSpaceType: CLASS_SPACE_TYPE,
    });
    expect(roleSpace(cooperativeDid, 'custom/steward')).toEqual({
      arbiterDid: cooperativeDid,
      spaceKey: 'roles/custom/steward',
      expectedSpaceType: ROLE_SPACE_TYPE,
    });
  });

  it('rejects empty role keys', () => {
    expect(() => roleSpace(cooperativeDid, ' ')).toThrow('non-empty role key');
  });

  it('parses known CSN space shapes and rejects unknown shapes', () => {
    expect(parseCsnSpace(membersSpace(cooperativeDid))).toEqual({
      kind: 'members',
      cooperativeDid,
    });
    expect(parseCsnSpace(roleSpace(cooperativeDid, 'member'))).toEqual({
      kind: 'role',
      cooperativeDid,
      role: 'member',
    });
    expect(parseCsnSpace(roleSpace(cooperativeDid, 'classes/worker'))).toEqual({
      kind: 'class',
      cooperativeDid,
      memberClass: 'worker',
    });
    expect(
      parseCsnSpace({
        arbiterDid: cooperativeDid,
        spaceKey: 'unknown/members',
        expectedSpaceType: 'network.coopsource.org.unknown',
      }),
    ).toBeNull();
  });
});
