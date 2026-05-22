import { describe, it, expect } from 'vitest';
import { spaceRefKey, type SpaceRef } from '../types.js';
import { fakeDid } from './helpers/factories.js';

describe('spaceRefKey', () => {
  it('returns a stable string key for a space ref', () => {
    const ref: SpaceRef = { arbiterDid: fakeDid('did:plc:abc'), spaceKey: 'members', expectedSpaceType: 'network.coopsource.org.spaceType.members' };
    expect(spaceRefKey(ref)).toBe('did:plc:abc|members|network.coopsource.org.spaceType.members');
  });

  it('produces the same key for equal refs', () => {
    const a: SpaceRef = { arbiterDid: fakeDid('did:plc:abc'), spaceKey: 'Y', expectedSpaceType: 'X' };
    const b: SpaceRef = { arbiterDid: fakeDid('did:plc:abc'), spaceKey: 'Y', expectedSpaceType: 'X' };
    expect(spaceRefKey(a)).toBe(spaceRefKey(b));
  });
});
