import type { DID } from '@coopsource/common';
import {
  KyselySpaceCredentialStore,
  type SpaceCredential,
  type SpaceRef,
} from '@coopsource/spaces-consumer';
import { beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, truncateAllTables } from './helpers/test-db.js';

const now = new Date('2026-05-11T12:00:00Z');
const ref: SpaceRef = {
  arbiterDid: 'did:plc:spaceauthority' as DID,
  spaceKey: 'members',
  expectedSpaceType:
    'network.coopsource.org.spaceType.closedCooperativeGovernance',
};

describe('KyselySpaceCredentialStore', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it('persists and retrieves a live credential across store instances', async () => {
    const db = getTestDb();
    const cred: SpaceCredential = {
      token: 'space-token-1',
      expiresAt: new Date('2026-05-11T13:00:00Z'),
    };

    await new KyselySpaceCredentialStore(db, { clock: () => now }).put(
      ref,
      cred,
    );
    const reloaded = new KyselySpaceCredentialStore(db, { clock: () => now });

    await expect(reloaded.get(ref)).resolves.toEqual(cred);
  });

  it('upserts by canonical SpaceRef key', async () => {
    const store = new KyselySpaceCredentialStore(getTestDb(), {
      clock: () => now,
    });
    await store.put(ref, {
      token: 'old-token',
      expiresAt: new Date('2026-05-11T12:30:00Z'),
    });
    const replacement: SpaceCredential = {
      token: 'new-token',
      expiresAt: new Date('2026-05-11T14:00:00Z'),
    };

    await store.put(ref, replacement);

    await expect(store.get(ref)).resolves.toEqual(replacement);
  });

  it('lists only live credentials and preserves nullable expected space type', async () => {
    const store = new KyselySpaceCredentialStore(getTestDb(), {
      clock: () => now,
    });
    const untypedRef: SpaceRef = {
      arbiterDid: 'did:plc:otherauthority' as DID,
      spaceKey: 'announcements',
    };
    await store.put(ref, {
      token: 'live-token',
      expiresAt: new Date('2026-05-11T13:00:00Z'),
    });
    await store.put(untypedRef, {
      token: 'untyped-token',
      expiresAt: new Date('2026-05-11T13:30:00Z'),
    });
    await store.put(
      { ...ref, spaceKey: 'expired' },
      { token: 'expired-token', expiresAt: new Date('2026-05-11T11:00:00Z') },
    );

    const live = await store.live();

    expect(live).toEqual([
      {
        ref: untypedRef,
        cred: {
          token: 'untyped-token',
          expiresAt: new Date('2026-05-11T13:30:00Z'),
        },
      },
      {
        ref,
        cred: {
          token: 'live-token',
          expiresAt: new Date('2026-05-11T13:00:00Z'),
        },
      },
    ]);
    await expect(
      store.get({ ...ref, spaceKey: 'expired' }),
    ).resolves.toBeUndefined();
  });

  it('deletes credentials by SpaceRef', async () => {
    const store = new KyselySpaceCredentialStore(getTestDb(), {
      clock: () => now,
    });
    await store.put(ref, {
      token: 'token-to-delete',
      expiresAt: new Date('2026-05-11T13:00:00Z'),
    });

    await store.delete(ref);

    await expect(store.get(ref)).resolves.toBeUndefined();
  });
});
