import type { CID, DID } from '@coopsource/common';
import {
  CredentialedPermissionedRepoPort,
  InMemorySpaceCredentialStore,
  KyselyPermissionedReplicaStore,
  SpaceCredentialManager,
  XrpcPermissionedRepoPort,
  cidForPermissionedRecord,
  formatPermissionedRecordLocationUri,
  ltHashForReplica,
  type PermissionedCommitVerifierPort,
  type PermissionedListRepoOpsRequest,
  type PermissionedListReposResponse,
  type PermissionedNotification,
  type PermissionedNotificationSourcePort,
  type PermissionedRepoOperation,
  type PermissionedSignedCommit,
  type PermissionedSyncXrpcClientPort,
  type PermissionedWatchHandle,
  type SpaceRef,
} from '@coopsource/spaces-consumer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  startSpacesConsumer,
  stopSpacesConsumer,
} from '../src/appview/spaces-consumer-dispatch.js';
import { createTestApp, type TestApp } from './helpers/test-app.js';
import { truncateAllTables } from './helpers/test-db.js';

const cooperativeDid = 'did:plc:coop' as DID;
const aliceDid = 'did:plc:alice' as DID;
const bobDid = 'did:plc:bob' as DID;
const space: SpaceRef = {
  arbiterDid: cooperativeDid,
  expectedSpaceType: 'network.coopsource.org.spaceType.members',
  spaceKey: 'members',
};
const now = new Date('2026-07-30T12:00:00Z');

describe('permissioned governance consumer', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    await stopSpacesConsumer();
    await truncateAllTables();
    testApp = createTestApp();
    await testApp.container.db
      .insertInto('entity')
      .values([
        entity(cooperativeDid, 'cooperative'),
        entity(aliceDid, 'person'),
        entity(bobDid, 'person'),
      ])
      .execute();
    await testApp.container.db
      .insertInto('membership')
      .values([membership(aliceDid), membership(bobDid)])
      .execute();
  });

  afterEach(async () => {
    await stopSpacesConsumer();
  });

  it('projects and checkpoints records, applies a tombstone, and recovers a missed notification', async () => {
    const proposal = {
      $type: 'network.coopsource.governance.proposal',
      cooperative: cooperativeDid,
      title: 'Permissioned proposal',
      body: 'Vote on this',
      bodyFormat: 'text',
      votingType: 'binary',
      quorumType: 'simpleMajority',
      quorumBasis: 'votesCast',
      createdAt: now.toISOString(),
    };
    const proposalCid = await cidForPermissionedRecord(proposal);
    const proposalUri = formatPermissionedRecordLocationUri({
      space,
      authorDid: aliceDid,
      collection: proposal.$type,
      rkey: 'proposal-1',
    });
    const vote = {
      $type: 'network.coopsource.governance.vote',
      proposal: proposalUri,
      proposalCid,
      choice: 'yes',
      createdAt: now.toISOString(),
    };
    const voteCid = await cidForPermissionedRecord(vote);
    const source = new TestNotificationSource();
    let runSweep: (() => void) | undefined;
    const client = new TestRepoClient([
      repo(aliceDid, '2', [
        operation('2', proposal.$type, 'proposal-1', proposalCid, proposal),
      ]),
      repo(bobDid, '2', [operation('2', vote.$type, 'vote-1', voteCid, vote)]),
    ]);
    const repoPort = credentialedRepo(testApp, client, source, (callback) => {
      runSweep = callback;
    });

    await startSpacesConsumer({
      enabled: true,
      unsafeAcceptUnverifiedPermissionedData: false,
      db: testApp.container.db,
      spaces: [space],
      permissionedRepo: repoPort,
    });
    await source.emit({
      space,
      repoDid: aliceDid,
      revision: '2',
      hash: client.hashFor(aliceDid),
      receivedAt: now,
    });

    const projected = await testApp.container.proposalService.getProposalByUri(
      proposalUri,
      cooperativeDid,
    );
    expect(projected).toMatchObject({
      proposal: {
        uri: proposalUri,
        cooperative_did: cooperativeDid,
        author_did: aliceDid,
        title: 'Permissioned proposal',
      },
      voteSummary: { yes: 1 },
    });
    expect(projected?.votes).toHaveLength(1);
    await expect(
      testApp.container.db
        .selectFrom('permissioned_repo_cursor')
        .select(['repo_did', 'revision'])
        .orderBy('repo_did')
        .execute(),
    ).resolves.toEqual([
      { repo_did: aliceDid, revision: '2' },
      { repo_did: bobDid, revision: '2' },
    ]);

    client.replace([
      repo(aliceDid, '2', [
        operation('2', proposal.$type, 'proposal-1', proposalCid, proposal),
      ]),
      repo(bobDid, '3', [
        operation('2', vote.$type, 'vote-1', voteCid, vote),
        {
          rev: '3',
          collection: vote.$type,
          rkey: 'vote-1',
          cid: null,
          prev: voteCid,
        },
      ]),
    ]);
    await source.emit({
      space,
      repoDid: bobDid,
      revision: '3',
      hash: client.hashFor(bobDid),
      receivedAt: new Date('2026-07-30T12:01:00Z'),
    });

    const afterDelete =
      await testApp.container.proposalService.getProposalByUri(
        proposalUri,
        cooperativeDid,
      );
    expect(afterDelete?.voteSummary).toEqual({});
    expect(afterDelete?.votes).toEqual([]);
    await expect(
      testApp.container.db
        .selectFrom('permissioned_repo_cursor')
        .select('revision')
        .where('repo_did', '=', bobDid)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({ revision: '3' });

    client.replace([
      repo(aliceDid, '2', [
        operation('2', proposal.$type, 'proposal-1', proposalCid, proposal),
      ]),
      repo(bobDid, '4', [
        operation('2', vote.$type, 'vote-1', voteCid, vote),
        {
          rev: '3',
          collection: vote.$type,
          rkey: 'vote-1',
          cid: null,
          prev: voteCid,
        },
        operation('4', vote.$type, 'vote-1', voteCid, vote),
      ]),
    ]);
    runSweep?.();

    await vi.waitFor(async () => {
      const recovered =
        await testApp.container.proposalService.getProposalByUri(
          proposalUri,
          cooperativeDid,
        );
      expect(recovered?.voteSummary).toEqual({ yes: 1 });
      expect(recovered?.votes).toHaveLength(1);
    });
    await expect(
      testApp.container.db
        .selectFrom('permissioned_repo_cursor')
        .select('revision')
        .where('repo_did', '=', bobDid)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({ revision: '4' });
  });
});

interface RepoFixture {
  readonly did: DID;
  readonly revision: string;
  readonly ops: ReadonlyArray<PermissionedRepoOperation>;
}

class TestRepoClient implements PermissionedSyncXrpcClientPort {
  constructor(private repos: RepoFixture[]) {}

  replace(repos: RepoFixture[]): void {
    this.repos = repos;
  }

  hashFor(did: DID): Uint8Array {
    const fixture = this.repos.find((candidate) => candidate.did === did);
    if (!fixture) throw new Error(`Missing repo fixture for ${did}`);
    return commitFor(fixture).hash;
  }

  async listRepos(): Promise<PermissionedListReposResponse> {
    return {
      repos: this.repos.map((fixture) => ({
        did: fixture.did,
        rev: fixture.revision,
        hash: commitFor(fixture).hash,
      })),
    };
  }

  async listRepoOps(request: PermissionedListRepoOpsRequest) {
    const fixture = this.repos.find(
      (candidate) => candidate.did === request.repoDid,
    );
    if (!fixture)
      throw new Error(`Missing repo fixture for ${request.repoDid}`);
    return {
      ops: fixture.ops.filter(
        (operation) => !request.since || operation.rev > request.since,
      ),
      commit: commitFor(fixture),
    };
  }

  async registerNotify() {
    return { expiresAt: new Date('2026-07-31T12:00:00Z') };
  }
}

class TestNotificationSource implements PermissionedNotificationSourcePort {
  private onNotification:
    | ((notification: PermissionedNotification) => Promise<void> | void)
    | undefined;

  subscribe(args: {
    readonly onNotification: (
      notification: PermissionedNotification,
    ) => Promise<void> | void;
  }): PermissionedWatchHandle {
    this.onNotification = args.onNotification;
    return {
      close: () => {
        this.onNotification = undefined;
      },
    };
  }

  async emit(notification: PermissionedNotification): Promise<void> {
    await this.onNotification?.(notification);
  }
}

const verifier: PermissionedCommitVerifierPort = {
  verify: async ({ commit, calculatedHash }) =>
    Buffer.from(commit.hash).equals(Buffer.from(calculatedHash)),
};

function credentialedRepo(
  testApp: TestApp,
  client: PermissionedSyncXrpcClientPort,
  source: PermissionedNotificationSourcePort,
  captureSweep: (callback: () => void) => void,
): CredentialedPermissionedRepoPort {
  const inner = new XrpcPermissionedRepoPort({
    client,
    endpoints: {
      resolveSpaceHost: async () => 'https://space.example',
      resolveRepoHost: async (did) =>
        did === aliceDid ? 'https://alice.example' : 'https://bob.example',
    },
    verifier,
    replicas: new KyselyPermissionedReplicaStore(testApp.container.db, {
      clock: () => now,
    }),
    notifications: source,
    sweepIntervalMs: 60_000,
    setInterval: (callback) => {
      captureSweep(callback);
      return {
        unref: () => undefined,
      } as unknown as ReturnType<typeof setInterval>;
    },
    clearInterval: () => undefined,
    clock: () => now,
  });
  const credentials = new SpaceCredentialManager(
    new InMemorySpaceCredentialStore({ clock: () => now }),
    {
      issue: async () => ({
        token: 'space-token',
        expiresAt: new Date('2026-07-30T13:00:00Z'),
      }),
    },
    { clock: () => now },
  );
  return new CredentialedPermissionedRepoPort({ inner, credentials });
}

function repo(
  did: DID,
  revision: string,
  ops: ReadonlyArray<PermissionedRepoOperation>,
): RepoFixture {
  return { did, revision, ops };
}

function operation(
  rev: string,
  collection: string,
  rkey: string,
  cid: CID,
  value: unknown,
): PermissionedRepoOperation {
  return { rev, collection, rkey, cid, prev: null, value };
}

function commitFor(fixture: RepoFixture): PermissionedSignedCommit {
  const records = new Map<string, { cid: CID; record: unknown }>();
  for (const operation of fixture.ops) {
    const key = `${operation.collection}/${operation.rkey}`;
    if (operation.cid === null) {
      records.delete(key);
    } else if (operation.value !== undefined) {
      records.set(key, {
        cid: operation.cid,
        record: operation.value,
      });
    }
  }
  return {
    ver: 1,
    hash: ltHashForReplica(
      [...records.entries()].map(([key, record]) => {
        const [collection, rkey] = key.split('/', 2);
        return {
          collection: collection!,
          rkey: rkey!,
          cid: record.cid,
          record: record.record,
          sourceRevision: fixture.revision,
        };
      }),
    ).digest(),
    mac: new Uint8Array(32),
    ikm: new Uint8Array(32),
    sig: new Uint8Array([1]),
    rev: fixture.revision,
  };
}

function entity(did: DID, type: 'cooperative' | 'person') {
  return {
    did,
    type,
    display_name: did,
    status: 'active',
    created_at: now,
    indexed_at: now,
  };
}

function membership(memberDid: DID) {
  return {
    member_did: memberDid,
    cooperative_did: cooperativeDid,
    status: 'active',
    member_class: null,
    directory_visible: false,
    joined_at: now,
    created_at: now,
    indexed_at: now,
  };
}
