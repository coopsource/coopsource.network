import { describe, it, expect } from 'vitest';
import { spaceRefKey, type SpaceRef } from '../types.js';

describe('spaceRefKey', () => {
  it('returns a stable string key for a space ref', () => {
    const ref: SpaceRef = { arbiter: 'did:plc:abc' as SpaceRef['arbiter'], type: 'network.coopsource.org.cooperative', skey: 'members' };
    expect(spaceRefKey(ref)).toBe('did:plc:abc|network.coopsource.org.cooperative|members');
  });

  it('produces the same key for equal refs', () => {
    const a: SpaceRef = { arbiter: 'did:plc:abc' as SpaceRef['arbiter'], type: 'X', skey: 'Y' };
    const b: SpaceRef = { arbiter: 'did:plc:abc' as SpaceRef['arbiter'], type: 'X', skey: 'Y' };
    expect(spaceRefKey(a)).toBe(spaceRefKey(b));
  });
});
