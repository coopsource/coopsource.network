import { describe, it, expect } from 'vitest';
import { StaticArbiterMemberList, DenyAllArbiterMemberList } from '../arbiter-member-list.js';
import type { SpaceRef } from '../types.js';
import { fakeDid } from './helpers/factories.js';

const ref: SpaceRef = { arbiterDid: fakeDid('did:plc:coop'), spaceKey: 'members', expectedSpaceType: 'X' };

describe('StaticArbiterMemberList', () => {
  it('isMember returns true for listed DIDs', async () => {
    const list = new StaticArbiterMemberList([{ space: ref, members: [fakeDid('did:plc:alice'), fakeDid('did:plc:bob')] }]);
    expect(await list.isMember(ref, fakeDid('did:plc:alice'))).toBe(true);
  });
  it('isMember returns false for unlisted DIDs', async () => {
    const list = new StaticArbiterMemberList([]);
    expect(await list.isMember(ref, fakeDid('did:plc:eve'))).toBe(false);
  });
  it('list returns all members', async () => {
    const list = new StaticArbiterMemberList([{ space: ref, members: [fakeDid('did:plc:a'), fakeDid('did:plc:b')] }]);
    expect(await list.list(ref)).toEqual([fakeDid('did:plc:a'), fakeDid('did:plc:b')]);
  });
});

describe('DenyAllArbiterMemberList', () => {
  it('rejects every membership query', async () => {
    const list = new DenyAllArbiterMemberList();
    expect(await list.isMember(ref, fakeDid('did:plc:alice'))).toBe(false);
    expect(await list.list(ref)).toEqual([]);
  });
});
