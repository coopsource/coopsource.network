import { describe, it, expect } from 'vitest';
import { StaticArbiterMemberList, DenyAllArbiterMemberList } from '../arbiter-member-list.js';
import type { SpaceRef } from '../types.js';

const ref: SpaceRef = { arbiter: 'did:plc:coop' as SpaceRef['arbiter'], type: 'X', skey: 'members' };

describe('StaticArbiterMemberList', () => {
  it('isMember returns true for listed DIDs', async () => {
    const list = new StaticArbiterMemberList({ [`${ref.arbiter}|${ref.type}|${ref.skey}`]: ['did:plc:alice' as never, 'did:plc:bob' as never] });
    expect(await list.isMember(ref, 'did:plc:alice' as never)).toBe(true);
  });
  it('isMember returns false for unlisted DIDs', async () => {
    const list = new StaticArbiterMemberList({});
    expect(await list.isMember(ref, 'did:plc:eve' as never)).toBe(false);
  });
  it('list returns all members', async () => {
    const list = new StaticArbiterMemberList({ [`${ref.arbiter}|${ref.type}|${ref.skey}`]: ['did:plc:a' as never, 'did:plc:b' as never] });
    expect(await list.list(ref)).toEqual(['did:plc:a', 'did:plc:b']);
  });
});

describe('DenyAllArbiterMemberList', () => {
  it('rejects every membership query', async () => {
    const list = new DenyAllArbiterMemberList();
    expect(await list.isMember(ref, 'did:plc:alice' as never)).toBe(false);
    expect(await list.list(ref)).toEqual([]);
  });
});
