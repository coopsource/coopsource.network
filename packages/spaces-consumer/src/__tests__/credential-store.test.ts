import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySpaceCredentialStore, type SpaceCredential } from '../credential-store.js';
import type { SpaceRef } from '../types.js';
import { fakeDid } from './helpers/factories.js';

const ref: SpaceRef = { arbiterDid: fakeDid('did:plc:abc'), spaceKey: 'members', expectedSpaceType: 'X' };

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
    await store.put({ ...ref, spaceKey: 'roles/board' }, { token: 't2', expiresAt: new Date('2026-05-11T13:00:00Z') });
    const live = await store.live();
    expect(live).toHaveLength(2);
  });

  it('deletes a credential so get returns undefined', async () => {
    const cred: SpaceCredential = { token: 't', expiresAt: new Date('2026-05-11T13:00:00Z') };
    await store.put(ref, cred);
    await store.delete(ref);
    expect(await store.get(ref)).toBeUndefined();
  });
});
