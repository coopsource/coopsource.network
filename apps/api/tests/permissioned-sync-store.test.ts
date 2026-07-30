import type { CID, DID } from '@coopsource/common';
import {
  KyselyPermissionedNotificationRegistrationStore,
  KyselyPermissionedRepoAccountStateStore,
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
      repoHost: 'https://alice.example',
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
      repoHost: 'https://alice-moved.example',
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
        .selectFrom('permissioned_repo_cursor')
        .select('repo_host')
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({ repo_host: 'https://alice-moved.example' });
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

  it('persists the newest host-scoped repository account state', async () => {
    const store = new KyselyPermissionedRepoAccountStateStore(getTestDb(), {
      clock: () => now,
    });
    const sourceHost = 'https://alice.example';
    await store.put({
      repoDid,
      sourceHost,
      active: false,
      status: 'deactivated',
      eventSequence: 42,
      eventTime: new Date('2026-07-30T11:59:00Z'),
    });
    await store.put({
      repoDid,
      sourceHost,
      active: true,
      eventSequence: 43,
      eventTime: now,
    });
    await store.put({
      repoDid,
      sourceHost,
      active: false,
      status: 'deactivated',
      eventSequence: 42,
      eventTime: new Date('2026-07-30T12:01:00Z'),
    });

    await expect(store.get(repoDid, sourceHost)).resolves.toEqual({
      repoDid,
      sourceHost,
      active: true,
      eventSequence: 43,
      eventTime: now,
    });
  });
});
