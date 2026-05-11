import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySpaceCredentialStore, type SpaceCredential } from '../credential-store.js';
import type { SpaceRef } from '../types.js';

const ref: SpaceRef = { arbiter: 'did:plc:abc' as SpaceRef['arbiter'], type: 'X', skey: 'members' };

describe('InMemorySpaceCredentialStore', () => {
  let store: InMemorySpaceCredentialStore;
  beforeEach(() => { store = new InMemorySpaceCredentialStore({ clock: () => new Date('2026-05-11T12:00:00Z') }); });

  it('returns undefined for a missing credential', async () => {
    expect(await store.get(ref)).toBeUndefined();
  });

  it('stores and retrieves a credential', async () => {
    const cred: SpaceCredential = { token: 't', expiresAt: new Date('2026-05-11T13:00:00Z') };
    await store.put(ref, cred);
    expect(await store.get(ref)).toEqual(cred);
  });

  it('treats expired credentials as missing', async () => {
    const cred: SpaceCredential = { token: 't', expiresAt: new Date('2026-05-11T11:00:00Z') };
    await store.put(ref, cred);
    expect(await store.get(ref)).toBeUndefined();
  });

  it('lists all live credentials', async () => {
    await store.put(ref, { token: 't1', expiresAt: new Date('2026-05-11T13:00:00Z') });
    await store.put({ ...ref, skey: 'board' }, { token: 't2', expiresAt: new Date('2026-05-11T13:00:00Z') });
    const live = await store.live();
    expect(live).toHaveLength(2);
  });
});
