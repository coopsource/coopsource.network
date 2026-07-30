import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemorySpaceCredentialStore,
  SpaceCredentialError,
  SpaceCredentialManager,
  type SpaceCredential,
  type SpaceCredentialIssueRequest,
  type SpaceCredentialIssuerPort,
} from '../credential-store.js';
import type { SpaceRef } from '../types.js';
import { fakeDid } from './helpers/factories.js';

const ref: SpaceRef = {
  arbiterDid: fakeDid('did:plc:abc'),
  spaceKey: 'members',
  expectedSpaceType: 'X',
};
const now = new Date('2026-05-11T12:00:00Z');

describe('InMemorySpaceCredentialStore', () => {
  let store: InMemorySpaceCredentialStore;
  beforeEach(() => {
    store = new InMemorySpaceCredentialStore({ clock: () => now });
  });

  it('returns undefined for a missing credential', async () => {
    expect(await store.get(ref)).toBeUndefined();
  });

  it('stores and retrieves a credential', async () => {
    const cred: SpaceCredential = {
      token: 't',
      expiresAt: new Date('2026-05-11T13:00:00Z'),
    };
    await store.put(ref, cred);
    expect(await store.get(ref)).toEqual(cred);
  });

  it('treats expired credentials as missing', async () => {
    const cred: SpaceCredential = {
      token: 't',
      expiresAt: new Date('2026-05-11T11:00:00Z'),
    };
    await store.put(ref, cred);
    expect(await store.get(ref)).toBeUndefined();
  });

  it('treats credentials with invalid expiry as missing', async () => {
    const cred: SpaceCredential = {
      token: 't',
      expiresAt: new Date(Number.NaN),
    };
    await store.put(ref, cred);
    expect(await store.get(ref)).toBeUndefined();
    expect(await store.live()).toEqual([]);
  });

  it('lists all live credentials', async () => {
    await store.put(ref, {
      token: 't1',
      expiresAt: new Date('2026-05-11T13:00:00Z'),
    });
    await store.put(
      { ...ref, spaceKey: 'roles/board' },
      { token: 't2', expiresAt: new Date('2026-05-11T13:00:00Z') },
    );
    const live = await store.live();
    expect(live).toHaveLength(2);
  });

  it('deletes a credential so get returns undefined', async () => {
    const cred: SpaceCredential = {
      token: 't',
      expiresAt: new Date('2026-05-11T13:00:00Z'),
    };
    await store.put(ref, cred);
    await store.delete(ref);
    expect(await store.get(ref)).toBeUndefined();
  });
});

describe('SpaceCredentialManager', () => {
  it('issues and stores a missing credential for a batch', async () => {
    const store = new InMemorySpaceCredentialStore({ clock: () => now });
    const issuer = new QueuedIssuer([
      { token: 'fresh', expiresAt: new Date('2026-05-11T13:00:00Z') },
    ]);
    const manager = new SpaceCredentialManager(store, issuer, {
      clock: () => now,
    });

    await expect(manager.getForBatch(ref)).resolves.toMatchObject({
      token: 'fresh',
    });
    expect(issuer.requests.map((request) => request.reason)).toEqual([
      'missing',
    ]);
    await expect(store.get(ref)).resolves.toMatchObject({ token: 'fresh' });
  });

  it('reuses a live credential when no refresh policy requires renewal', async () => {
    const store = new InMemorySpaceCredentialStore({ clock: () => now });
    const liveCredential = {
      token: 'live',
      expiresAt: new Date('2026-05-11T13:00:00Z'),
    };
    await store.put(ref, liveCredential);
    const issuer = new QueuedIssuer([]);
    const manager = new SpaceCredentialManager(store, issuer, {
      clock: () => now,
    });

    await expect(manager.getForBatch(ref)).resolves.toEqual(liveCredential);
    expect(issuer.requests).toHaveLength(0);
  });

  it('refreshes every batch when configured for refresh-per-batch', async () => {
    const store = new InMemorySpaceCredentialStore({ clock: () => now });
    await store.put(ref, {
      token: 'old',
      expiresAt: new Date('2026-05-11T13:00:00Z'),
    });
    const issuer = new QueuedIssuer([
      { token: 'fresh-1', expiresAt: new Date('2026-05-11T13:00:00Z') },
      { token: 'fresh-2', expiresAt: new Date('2026-05-11T13:00:00Z') },
    ]);
    const manager = new SpaceCredentialManager(store, issuer, {
      clock: () => now,
      refreshPerBatch: true,
    });

    await expect(manager.getForBatch(ref)).resolves.toMatchObject({
      token: 'fresh-1',
    });
    await expect(manager.getForBatch(ref)).resolves.toMatchObject({
      token: 'fresh-2',
    });
    expect(issuer.requests.map((request) => request.reason)).toEqual([
      'refresh-per-batch',
      'refresh-per-batch',
    ]);
    expect(issuer.requests[0]!.previous?.token).toBe('old');
    expect(issuer.requests[1]!.previous?.token).toBe('fresh-1');
  });

  it('refreshes credentials inside the configured expiry window', async () => {
    const store = new InMemorySpaceCredentialStore({ clock: () => now });
    await store.put(ref, {
      token: 'soon',
      expiresAt: new Date('2026-05-11T12:02:00Z'),
    });
    const issuer = new QueuedIssuer([
      { token: 'renewed', expiresAt: new Date('2026-05-11T13:00:00Z') },
    ]);
    const manager = new SpaceCredentialManager(store, issuer, {
      clock: () => now,
      refreshBeforeMs: 5 * 60 * 1000,
    });

    await expect(manager.getForBatch(ref)).resolves.toMatchObject({
      token: 'renewed',
    });
    expect(issuer.requests[0]!.reason).toBe('near-expiry');
  });

  it('invalidates a credential after member-list change so the next batch refreshes', async () => {
    const store = new InMemorySpaceCredentialStore({ clock: () => now });
    await store.put(ref, {
      token: 'old',
      expiresAt: new Date('2026-05-11T13:00:00Z'),
    });
    const issuer = new QueuedIssuer([
      { token: 'rotated', expiresAt: new Date('2026-05-11T13:00:00Z') },
    ]);
    const manager = new SpaceCredentialManager(store, issuer, {
      clock: () => now,
    });

    await manager.invalidate(ref);
    await expect(manager.getForBatch(ref)).resolves.toMatchObject({
      token: 'rotated',
    });
    expect(issuer.requests[0]!.reason).toBe('missing');
  });

  it('rejects already-expired credentials returned by an issuer', async () => {
    const store = new InMemorySpaceCredentialStore({ clock: () => now });
    const issuer = new QueuedIssuer([
      { token: 'expired', expiresAt: new Date('2026-05-11T12:00:00Z') },
    ]);
    const manager = new SpaceCredentialManager(store, issuer, {
      clock: () => now,
    });

    await expect(manager.getForBatch(ref)).rejects.toBeInstanceOf(
      SpaceCredentialError,
    );
    await expect(store.get(ref)).resolves.toBeUndefined();
  });

  it('rejects credentials with invalid expiry returned by an issuer', async () => {
    const store = new InMemorySpaceCredentialStore({ clock: () => now });
    const issuer = new QueuedIssuer([
      { token: 'invalid', expiresAt: new Date(Number.NaN) },
    ]);
    const manager = new SpaceCredentialManager(store, issuer, {
      clock: () => now,
    });

    await expect(manager.getForBatch(ref)).rejects.toBeInstanceOf(
      SpaceCredentialError,
    );
    await expect(store.get(ref)).resolves.toBeUndefined();
  });
});

class QueuedIssuer implements SpaceCredentialIssuerPort {
  readonly requests: SpaceCredentialIssueRequest[] = [];

  constructor(private readonly credentials: SpaceCredential[]) {}

  async issue(request: SpaceCredentialIssueRequest): Promise<SpaceCredential> {
    this.requests.push(request);
    const credential = this.credentials.shift();
    if (!credential) {
      throw new Error(`Unexpected issue request: ${request.reason}`);
    }
    await Promise.resolve();
    return credential;
  }
}
