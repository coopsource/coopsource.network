import { describe, expect, it, vi } from 'vitest';
import type { CID, DID } from '@coopsource/common';
import type { SpaceCredential } from '../credential-store.js';
import {
  InMemoryPermissionedReplicaStore,
  ltHashForReplica,
  type PermissionedCommitVerifierPort,
  type PermissionedReplicaRecord,
  type PermissionedReplicaState,
  type PermissionedRepoOperation,
  type PermissionedSignedCommit,
} from '../permissioned-sync.js';
import {
  InMemoryPermissionedNotificationRegistrationStore,
  XrpcPermissionedRepoPort,
  type PermissionedListRepoOpsRequest,
  type PermissionedListReposResponse,
  type PermissionedNotification,
  type PermissionedNotificationSourcePort,
  type PermissionedRecoveredRepo,
  type PermissionedRepoRecoveryPort,
  type PermissionedSyncXrpcClientPort,
} from '../xrpc-permissioned-repo-port.js';
import type { PermissionedChangeHint, SpaceRef } from '../types.js';
import { cidForPermissionedRecord } from '../permissioned-sync.js';

const space: SpaceRef = {
  arbiterDid: 'did:plc:coop' as DID,
  expectedSpaceType: 'network.coopsource.org.spaceType.members',
  spaceKey: 'members',
};
const alice = 'did:plc:alice' as DID;
const bob = 'did:plc:bob' as DID;
const credential: SpaceCredential = {
  token: 'space-token',
  expiresAt: new Date('2026-07-30T14:00:00Z'),
};
const now = new Date('2026-07-30T12:00:00Z');

describe('XrpcPermissionedRepoPort', () => {
  it('stages verified creates until the projection checkpoint commits', async () => {
    const record = {
      $type: 'network.coopsource.governance.vote',
      proposal: 'proposal-1',
      choice: 'yes',
    };
    const cid = await cidForPermissionedRecord(record);
    const client = new RepoClient([
      repoFixture(alice, '2', [
        {
          rev: '2',
          collection: 'network.coopsource.governance.vote',
          rkey: 'vote-1',
          cid,
          prev: null,
          value: record,
        },
      ]),
    ]);
    const replicas = new InMemoryPermissionedReplicaStore();
    const port = buildPort(client, replicas);

    const changes = await port.sync({ space, credential });

    expect(changes.verification).toBe('verified');
    expect(changes.records).toEqual([
      expect.objectContaining({
        operation: 'create',
        cid,
        record,
        location: expect.objectContaining({
          authorDid: alice,
          rkey: 'vote-1',
        }),
      }),
    ]);
    await expect(replicas.load(space, alice)).resolves.toBeUndefined();

    await port.commitCheckpoint({
      space,
      checkpoint: changes.checkpoint!,
    });
    await expect(replicas.load(space, alice)).resolves.toMatchObject({
      repoDid: alice,
      revision: '2',
      records: [expect.objectContaining({ cid, record })],
    });
  });

  it('replays a projected batch after restart when its checkpoint was not committed', async () => {
    const record = { $type: 'app.example.record', value: 'one' };
    const cid = await cidForPermissionedRecord(record);
    const client = new RepoClient([
      repoFixture(alice, '2', [
        {
          rev: '2',
          collection: 'app.example.record',
          rkey: 'one',
          cid,
          prev: null,
          value: record,
        },
      ]),
    ]);
    const replicas = new InMemoryPermissionedReplicaStore();

    const first = await buildPort(client, replicas).sync({
      space,
      credential,
    });
    const replay = await buildPort(client, replicas).sync({
      space,
      credential,
    });

    expect(first.records).toEqual(replay.records);
    expect(first.checkpoint).not.toBe(replay.checkpoint);
  });

  it('supersedes an abandoned staged checkpoint on retry', async () => {
    const record = { $type: 'app.example.record', value: 'one' };
    const cid = await cidForPermissionedRecord(record);
    const port = buildPort(
      new RepoClient([repoFixture(alice, '2', [op('2', 'one', cid, record)])]),
    );
    const first = await port.sync({ space, credential });
    const retry = await port.sync({ space, credential });

    await expect(
      port.commitCheckpoint({
        space,
        checkpoint: first.checkpoint!,
      }),
    ).rejects.toThrow('Unknown or already committed');
    await expect(
      port.commitCheckpoint({
        space,
        checkpoint: retry.checkpoint!,
      }),
    ).resolves.toBeUndefined();
  });

  it('treats a conflicting notification hash as a hint when listRepos is current', async () => {
    const record = { $type: 'app.example.record', value: 'one' };
    const cid = await cidForPermissionedRecord(record);
    const fixture = repoFixture(alice, '2', [op('2', 'one', cid, record)]);
    const client = new RepoClient([fixture]);
    const replicas = new InMemoryPermissionedReplicaStore();
    const port = buildPort(client, replicas);
    const initial = await port.sync({ space, credential });
    await port.commitCheckpoint({ space, checkpoint: initial.checkpoint! });

    const duplicate = await port.sync({
      space,
      credential,
      hint: {
        space,
        repoDid: alice,
        sourceRevision: '2',
        sourceHash: new Uint8Array(32),
        receivedAt: now,
      },
    });

    expect(duplicate.records).toEqual([]);
    expect(duplicate.checkpoint).toBeUndefined();
  });

  it('does not reintroduce a writer absent from the authority inventory', async () => {
    const changes = await buildPort(new RepoClient([])).sync({
      space,
      credential,
      hint: {
        space,
        repoDid: alice,
        sourceRevision: '2',
        receivedAt: now,
      },
    });

    expect(changes.records).toEqual([]);
    expect(changes.checkpoint).toBeUndefined();
  });

  it('projects tombstones after a verified delete', async () => {
    const record = { $type: 'app.example.record', value: 'one' };
    const cid = await cidForPermissionedRecord(record);
    const client = new RepoClient([
      repoFixture(alice, '2', [
        {
          rev: '2',
          collection: 'app.example.record',
          rkey: 'one',
          cid,
          prev: null,
          value: record,
        },
      ]),
    ]);
    const replicas = new InMemoryPermissionedReplicaStore();
    const port = buildPort(client, replicas);
    const first = await port.sync({ space, credential });
    await port.commitCheckpoint({ space, checkpoint: first.checkpoint! });
    client.replace([
      repoFixture(alice, '3', [
        {
          rev: '3',
          collection: 'app.example.record',
          rkey: 'one',
          cid: null,
          prev: cid,
        },
      ]),
    ]);

    const deleted = await port.sync({ space, credential });

    expect(deleted.records).toEqual([
      expect.objectContaining({
        operation: 'delete',
        previousCid: cid,
        location: expect.objectContaining({ rkey: 'one' }),
      }),
    ]);
  });

  it('tombstones and removes a persisted writer missing from listRepos', async () => {
    const record = { $type: 'app.example.record', value: 'one' };
    const cid = await cidForPermissionedRecord(record);
    const client = new RepoClient([
      repoFixture(alice, '2', [op('2', 'one', cid, record)]),
    ]);
    const replicas = new InMemoryPermissionedReplicaStore();
    const port = buildPort(client, replicas);
    const initial = await port.sync({ space, credential });
    await port.commitCheckpoint({ space, checkpoint: initial.checkpoint! });
    client.replace([]);

    const removed = await port.sync({ space, credential });

    expect(removed.records).toEqual([
      expect.objectContaining({
        operation: 'delete',
        previousCid: cid,
        location: expect.objectContaining({
          authorDid: alice,
          rkey: 'one',
        }),
      }),
    ]);
    await port.commitCheckpoint({ space, checkpoint: removed.checkpoint! });
    await expect(replicas.load(space, alice)).resolves.toBeUndefined();

    const nextSweep = await port.sync({ space, credential });
    expect(nextSweep.records).toEqual([]);
    expect(nextSweep.checkpoint).toBeUndefined();
  });

  it('tombstones a writer when its verified repo host reports it inactive', async () => {
    const record = { $type: 'app.example.record', value: 'one' };
    const cid = await cidForPermissionedRecord(record);
    const client = new RepoClient([
      repoFixture(alice, '2', [op('2', 'one', cid, record)]),
    ]);
    const replicas = new InMemoryPermissionedReplicaStore();
    const port = buildPort(client, replicas);
    const initial = await port.sync({ space, credential });
    await port.commitCheckpoint({ space, checkpoint: initial.checkpoint! });

    const invalidated = await port.sync({
      space,
      credential,
      hint: {
        space,
        repoDid: alice,
        receivedAt: now,
        repoLifecycle: {
          kind: 'account',
          sequence: 42,
          did: alice,
          occurredAt: now,
          active: false,
          status: 'deactivated',
          sourceHost: 'https://alice.example/',
        },
      },
    });

    expect(invalidated.records).toEqual([
      expect.objectContaining({
        operation: 'delete',
        previousCid: cid,
        location: expect.objectContaining({ authorDid: alice, rkey: 'one' }),
      }),
    ]);
    await port.commitCheckpoint({
      space,
      checkpoint: invalidated.checkpoint!,
    });
    await expect(replicas.load(space, alice)).resolves.toBeUndefined();

    const suppressedSweep = await port.sync({ space, credential });
    expect(suppressedSweep.records).toEqual([]);
    expect(suppressedSweep.checkpoint).toBeUndefined();
    await expect(replicas.load(space, alice)).resolves.toBeUndefined();

    const reactivated = await port.sync({
      space,
      credential,
      hint: {
        space,
        repoDid: alice,
        receivedAt: now,
        repoLifecycle: {
          kind: 'account',
          sequence: 43,
          did: alice,
          occurredAt: now,
          active: true,
          sourceHost: 'https://alice.example',
        },
      },
    });
    expect(reactivated.records).toEqual([
      expect.objectContaining({
        operation: 'create',
        cid,
        location: expect.objectContaining({ authorDid: alice, rkey: 'one' }),
      }),
    ]);
    await port.commitCheckpoint({
      space,
      checkpoint: reactivated.checkpoint!,
    });

    const staleInactiveReplay = await port.sync({
      space,
      credential,
      hint: {
        space,
        repoDid: alice,
        receivedAt: now,
        repoLifecycle: {
          kind: 'account',
          sequence: 42,
          did: alice,
          occurredAt: now,
          active: false,
          status: 'deactivated',
          sourceHost: 'https://alice.example',
        },
      },
    });
    expect(staleInactiveReplay.records).toEqual([]);
    await expect(replicas.load(space, alice)).resolves.toMatchObject({
      records: [expect.objectContaining({ cid })],
    });
  });

  it('does not tombstone from an inactive event emitted by another host', async () => {
    const record = { $type: 'app.example.record', value: 'one' };
    const cid = await cidForPermissionedRecord(record);
    const client = new RepoClient([
      repoFixture(alice, '2', [op('2', 'one', cid, record)]),
    ]);
    const replicas = new InMemoryPermissionedReplicaStore();
    const port = buildPort(client, replicas);
    const initial = await port.sync({ space, credential });
    await port.commitCheckpoint({ space, checkpoint: initial.checkpoint! });

    const reconciled = await port.sync({
      space,
      credential,
      hint: {
        space,
        repoDid: alice,
        receivedAt: now,
        repoLifecycle: {
          kind: 'account',
          sequence: 42,
          did: alice,
          occurredAt: now,
          active: false,
          status: 'takendown',
          sourceHost: 'https://relay.example',
        },
      },
    });

    expect(reconciled.records).toEqual([]);
    expect(reconciled.checkpoint).toBeDefined();
    await expect(replicas.load(space, alice)).resolves.toMatchObject({
      repoHost: 'https://alice.example',
      records: [expect.objectContaining({ cid })],
    });
  });

  it('refreshes the stored writer endpoint on an identity event', async () => {
    const record = { $type: 'app.example.record', value: 'one' };
    const cid = await cidForPermissionedRecord(record);
    const client = new RepoClient([
      repoFixture(alice, '2', [op('2', 'one', cid, record)]),
    ]);
    const replicas = new InMemoryPermissionedReplicaStore();
    let repoHost = 'https://alice.example';
    const port = buildPort(client, replicas, undefined, {
      endpoints: {
        resolveSpaceHost: async () => 'https://space.example',
        resolveRepoHost: async () => repoHost,
      },
    });
    const initial = await port.sync({ space, credential });
    await port.commitCheckpoint({ space, checkpoint: initial.checkpoint! });
    repoHost = 'https://alice-moved.example';

    const reconciled = await port.sync({
      space,
      credential,
      hint: {
        space,
        repoDid: alice,
        receivedAt: now,
        repoLifecycle: {
          kind: 'identity',
          sequence: 43,
          did: alice,
          occurredAt: now,
          handle: 'alice.example',
        },
      },
    });
    await port.commitCheckpoint({
      space,
      checkpoint: reconciled.checkpoint!,
    });

    expect(reconciled.records).toEqual([]);
    await expect(replicas.load(space, alice)).resolves.toMatchObject({
      repoHost: 'https://alice-moved.example',
      revision: '2',
    });
  });

  it('syncs concurrent writer repositories in stable order', async () => {
    const aliceRecord = { $type: 'app.example.record', value: 'alice' };
    const bobRecord = { $type: 'app.example.record', value: 'bob' };
    const aliceCid = await cidForPermissionedRecord(aliceRecord);
    const bobCid = await cidForPermissionedRecord(bobRecord);
    const client = new RepoClient([
      repoFixture(bob, '4', [op('4', 'bob', bobCid, bobRecord)]),
      repoFixture(alice, '3', [op('3', 'alice', aliceCid, aliceRecord)]),
    ]);

    const changes = await buildPort(client).sync({ space, credential });

    expect(changes.records.map((change) => change.location.authorDid)).toEqual([
      alice,
      bob,
    ]);
  });

  it('uses full recovery after an LtHash mismatch', async () => {
    const incremental = { $type: 'app.example.record', value: 'bad' };
    const recoveredRecord = {
      $type: 'app.example.record',
      value: 'recovered',
    };
    const incrementalCid = await cidForPermissionedRecord(incremental);
    const recoveredCid = await cidForPermissionedRecord(recoveredRecord);
    const client = new RepoClient([
      {
        ...repoFixture(alice, '2', [
          op('2', 'one', incrementalCid, incremental),
        ]),
        commitHash: new Uint8Array(32),
      },
    ]);
    const recoveredState: PermissionedReplicaState = {
      space,
      repoDid: alice,
      revision: '2',
      records: [
        {
          collection: 'app.example.record',
          rkey: 'one',
          cid: recoveredCid,
          record: recoveredRecord,
          sourceRevision: '2',
        },
      ],
    };
    const advertisedHash = commitFor(recoveredState, '2').hash;
    client.replace([
      {
        ...repoFixture(alice, '2', [
          op('2', 'one', incrementalCid, incremental),
        ]),
        commitHash: new Uint8Array(32),
        advertisedHash,
      },
    ]);
    const recovery = new RecordingRecovery({
      state: recoveredState,
      commit: commitFor(recoveredState, '2'),
    });

    const changes = await buildPort(
      client,
      new InMemoryPermissionedReplicaStore(),
      recovery,
    ).sync({ space, credential });

    expect(recovery.calls).toBe(1);
    expect(changes.verification).toBe('resynced');
    expect(changes.records[0]).toMatchObject({
      operation: 'create',
      cid: recoveredCid,
      record: recoveredRecord,
    });
  });

  it('does not checkpoint a notification delivered before its write is readable', async () => {
    const oldState: PermissionedReplicaState = {
      space,
      repoDid: alice,
      revision: '2',
      records: [],
    };
    const recovery = new RecordingRecovery({
      state: oldState,
      commit: commitFor(oldState, '2'),
    });
    const client: PermissionedSyncXrpcClientPort = {
      listRepos: async () => ({
        repos: [{ did: alice, rev: '3' }],
      }),
      listRepoOps: async () => ({
        ops: [],
        commit: commitFor(oldState, '2'),
      }),
      registerNotify: async () => ({
        expiresAt: new Date('2026-07-31T12:00:00Z'),
      }),
    };

    await expect(
      buildPort(client, new InMemoryPermissionedReplicaStore(), recovery).sync({
        space,
        credential,
        hint: {
          space,
          repoDid: alice,
          sourceRevision: '3',
          receivedAt: now,
        },
      }),
    ).rejects.toThrow(
      'Recovered repository has not reached the announced revision',
    );
  });

  it('treats notifications as hints and periodic sweeps as recovery', async () => {
    const source = new RecordingNotificationSource();
    let sweep: (() => void) | undefined;
    const onChange = vi.fn<(hint: PermissionedChangeHint) => Promise<void>>(
      async () => {},
    );
    const port = buildPort(new RepoClient([]), undefined, undefined, {
      notifications: source,
      sweepIntervalMs: 60_000,
      setInterval: (callback) => {
        sweep = callback;
        return {
          unref: () => undefined,
        } as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval: vi.fn(),
    });
    const handle = await port.watch({ spaces: [space], onChange });
    const notification: PermissionedNotification = {
      space,
      repoDid: alice,
      revision: '7',
      hash: new Uint8Array(32),
      receivedAt: now,
    };

    await source.emit(notification);
    sweep?.();
    await Promise.resolve();

    expect(onChange).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        space,
        repoDid: alice,
        sourceRevision: '7',
      }),
    );
    expect(onChange).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ space }),
    );
    await handle.close();
    await source.emit(notification);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('reuses a live persisted notification registration', async () => {
    const client = new RepoClient([]);
    const registrations =
      new InMemoryPermissionedNotificationRegistrationStore();
    const options = {
      notificationEndpoint: 'https://app.example/xrpc/notify',
      registrations,
    };

    await buildPort(client, undefined, undefined, options).sync({
      space,
      credential,
    });
    await buildPort(client, undefined, undefined, options).sync({
      space,
      credential,
    });

    expect(client.registrationCalls).toBe(1);
  });
});

interface RepoFixture {
  readonly did: DID;
  readonly revision: string;
  readonly ops: ReadonlyArray<PermissionedRepoOperation>;
  readonly commitHash?: Uint8Array;
  readonly advertisedHash?: Uint8Array;
}

class RepoClient implements PermissionedSyncXrpcClientPort {
  private repos: RepoFixture[];
  registrationCalls = 0;

  constructor(repos: RepoFixture[]) {
    this.repos = repos;
  }

  replace(repos: RepoFixture[]): void {
    this.repos = repos;
  }

  async listRepos(): Promise<PermissionedListReposResponse> {
    return {
      repos: this.repos.map((repo) => {
        const state = stateFromOps(repo.did, repo.revision, repo.ops);
        return {
          did: repo.did,
          rev: repo.revision,
          hash:
            repo.advertisedHash ??
            repo.commitHash ??
            commitFor(state, repo.revision).hash,
        };
      }),
    };
  }

  async listRepoOps(request: PermissionedListRepoOpsRequest) {
    const repo = this.repos.find(
      (candidate) => candidate.did === request.repoDid,
    );
    if (!repo) throw new Error('repo not found');
    const ops = repo.ops.filter(
      (operation) => !request.since || operation.rev > request.since,
    );
    const state = stateFromOps(repo.did, repo.revision, repo.ops);
    return {
      ops,
      commit: {
        ...commitFor(state, repo.revision),
        ...(repo.commitHash ? { hash: repo.commitHash } : {}),
      },
    };
  }

  async registerNotify() {
    this.registrationCalls += 1;
    return { expiresAt: new Date('2026-07-31T12:00:00Z') };
  }
}

class RecordingRecovery implements PermissionedRepoRecoveryPort {
  calls = 0;

  constructor(private readonly recovered: PermissionedRecoveredRepo) {}

  async recover(): Promise<PermissionedRecoveredRepo> {
    this.calls += 1;
    return this.recovered;
  }
}

class RecordingNotificationSource implements PermissionedNotificationSourcePort {
  private handler:
    | ((notification: PermissionedNotification) => Promise<void> | void)
    | undefined;

  subscribe(args: {
    readonly onNotification: (
      notification: PermissionedNotification,
    ) => Promise<void> | void;
  }) {
    this.handler = args.onNotification;
    return {
      close: () => {
        this.handler = undefined;
      },
    };
  }

  async emit(notification: PermissionedNotification): Promise<void> {
    await this.handler?.(notification);
  }
}

const verifier: PermissionedCommitVerifierPort = {
  verify: async ({ commit, calculatedHash }) =>
    Buffer.from(commit.hash).equals(Buffer.from(calculatedHash)),
};

function buildPort(
  client: PermissionedSyncXrpcClientPort,
  replicas = new InMemoryPermissionedReplicaStore(),
  recovery?: PermissionedRepoRecoveryPort,
  overrides: Partial<
    ConstructorParameters<typeof XrpcPermissionedRepoPort>[0]
  > = {},
): XrpcPermissionedRepoPort {
  return new XrpcPermissionedRepoPort({
    client,
    endpoints: {
      resolveSpaceHost: async () => 'https://space.example',
      resolveRepoHost: async (did) =>
        `https://${did === alice ? 'alice' : 'bob'}.example`,
    },
    verifier,
    replicas,
    recovery,
    clock: () => now,
    sweepIntervalMs: 0,
    ...overrides,
  });
}

function repoFixture(
  did: DID,
  revision: string,
  ops: ReadonlyArray<PermissionedRepoOperation>,
): RepoFixture {
  return { did, revision, ops };
}

function op(
  rev: string,
  rkey: string,
  cid: CID,
  value: unknown,
): PermissionedRepoOperation {
  return {
    rev,
    collection: 'app.example.record',
    rkey,
    cid,
    prev: null,
    value,
  };
}

function stateFromOps(
  did: DID,
  revision: string,
  ops: ReadonlyArray<PermissionedRepoOperation>,
): PermissionedReplicaState {
  const records = new Map<string, PermissionedReplicaRecord>();
  for (const operation of ops) {
    const key = `${operation.collection}/${operation.rkey}`;
    if (operation.cid === null) {
      records.delete(key);
    } else if (operation.value !== undefined) {
      records.set(key, {
        collection: operation.collection,
        rkey: operation.rkey,
        cid: operation.cid,
        record: operation.value,
        sourceRevision: operation.rev,
      });
    }
  }
  return {
    space,
    repoDid: did,
    revision,
    records: [...records.values()],
  };
}

function commitFor(
  state: PermissionedReplicaState,
  revision: string,
): PermissionedSignedCommit {
  return {
    ver: 1,
    hash: ltHashForReplica(state.records).digest(),
    mac: new Uint8Array(32),
    ikm: new Uint8Array(32),
    sig: new Uint8Array([1]),
    rev: revision,
  };
}
