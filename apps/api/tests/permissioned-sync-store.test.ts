import type { CID, DID } from '@coopsource/common';
import {
  KyselyPermissionedNotificationRegistrationStore,
  KyselyPermissionedReplicaStore,
  type PermissionedReplicaState,
  type SpaceRef,
} from '@coopsource/spaces-consumer';
import { beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, truncateAllTables } from './helpers/test-db.js';

const now = new Date('2026-07-30T12:00:00Z');
const space: SpaceRef = {
  arbiterDid: 'did:plc:coop' as DID,
  expectedSpaceType: 'network.coopsource.org.spaceType.members',
  spaceKey: 'members',
};
const repoDid = 'did:plc:alice' as DID;

describe('permissioned sync persistence', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it('atomically replaces a writer replica and cursor', async () => {
    const store = new KyselyPermissionedReplicaStore(getTestDb(), {
      clock: () => now,
    });
    const initial: PermissionedReplicaState = {
      space,
      repoDid,
      revision: '2',
      records: [
        {
          collection: 'app.example.record',
          rkey: 'one',
          cid: 'bafy-one' as CID,
          record: { value: 'one' },
          sourceRevision: '2',
        },
      ],
    };
    await store.commit([initial]);

    await expect(store.list(space)).resolves.toEqual([initial]);
    await expect(
      new KyselyPermissionedReplicaStore(getTestDb(), {
        clock: () => now,
      }).load(space, repoDid),
    ).resolves.toEqual(initial);

    const replacement: PermissionedReplicaState = {
      space,
      repoDid,
      revision: '3',
      records: [
        {
          collection: 'app.example.record',
          rkey: 'two',
          cid: 'bafy-two' as CID,
          record: { value: 'two' },
          sourceRevision: '3',
        },
      ],
    };
    await store.commit([replacement]);

    await expect(store.load(space, repoDid)).resolves.toEqual(replacement);
    await expect(
      getTestDb()
        .selectFrom('permissioned_repo_record')
        .select('rkey')
        .execute(),
    ).resolves.toEqual([{ rkey: 'two' }]);

    await store.commit([{ ...replacement, records: [], removed: true }]);
    await expect(store.list(space)).resolves.toEqual([]);
    await expect(store.load(space, repoDid)).resolves.toBeUndefined();
  });

  it('persists notification registration expiry by space and endpoint', async () => {
    const store = new KyselyPermissionedNotificationRegistrationStore(
      getTestDb(),
      { clock: () => now },
    );
    const endpoint = 'https://app.example/xrpc/com.atproto.space.notifyWrite';
    await store.put({
      space,
      endpoint,
      expiresAt: new Date('2026-07-31T12:00:00Z'),
    });
    await store.put({
      space,
      endpoint,
      expiresAt: new Date('2026-08-01T12:00:00Z'),
    });

    await expect(store.get(space, endpoint)).resolves.toEqual({
      space,
      endpoint,
      expiresAt: new Date('2026-08-01T12:00:00Z'),
    });
  });
});
