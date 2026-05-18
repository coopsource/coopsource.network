import { describe, expect, it } from 'vitest';
import type { DID } from '@coopsource/common';
import {
  MEMBERS_SPACE_SKEY,
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
      arbiter: cooperativeDid,
      type: MEMBERS_SPACE_TYPE,
      skey: MEMBERS_SPACE_SKEY,
    });
  });

  it('builds the temporary role space reference', () => {
    expect(roleSpace(cooperativeDid, 'admin')).toEqual({
      arbiter: cooperativeDid,
      type: ROLE_SPACE_TYPE,
      skey: 'admin',
    });
  });

  it('rejects empty role skeys', () => {
    expect(() => roleSpace(cooperativeDid, ' ')).toThrow('non-empty role skey');
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
    expect(
      parseCsnSpace({
        arbiter: cooperativeDid,
        type: 'network.coopsource.org.unknown',
        skey: 'members',
      }),
    ).toBeNull();
  });
});
