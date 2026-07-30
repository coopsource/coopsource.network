import { randomUUID } from 'node:crypto';
import type { CID, DID } from '@coopsource/common';
import { SPACE_XRPC_METHODS } from '@coopsource/lexicons';
import type { SpaceCredential } from './credential-store.js';
import {
  FailClosedPermissionedBlobVerifier,
  type PermissionedBlobVerifierPort,
} from './permissioned-blob-verifier.js';
import type {
  PermissionedRepoPort,
  PermissionedWatchHandle,
} from './permissioned-repo-port.js';
import {
  InMemoryPermissionedReplicaStore,
  PermissionedSyncError,
  Proposal0016LtHash,
  cidForPermissionedRecord,
  diffPermissionedReplica,
  ltHashForReplica,
  type PermissionedCommitVerifierPort,
  type PermissionedReplicaRecord,
  type PermissionedReplicaState,
  type PermissionedReplicaStore,
  type PermissionedRepoOperation,
  type PermissionedSignedCommit,
  type PermissionedWriterSummary,
} from './permissioned-sync.js';
import { formatSpaceUri, parseSpaceUri } from './space-uri.js';
import {
  spaceRefKey,
  type ClockedOptions,
  type PermissionedChangeHint,
  type PermissionedCheckpoint,
  type SpaceRef,
  type VerifiedPermissionedChanges,
  type VerifiedPermissionedRecord,
} from './types.js';

const LIST_REPOS_NSID = SPACE_XRPC_METHODS.listRepos;
const LIST_REPO_OPS_NSID = SPACE_XRPC_METHODS.listRepoOps;
const REGISTER_NOTIFY_NSID = SPACE_XRPC_METHODS.registerNotify;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_SWEEP_INTERVAL_MS = 60_000;
const REGISTRATION_REFRESH_BEFORE_MS = 5 * 60_000;

type JsonObject = { readonly [key: string]: unknown };

export interface PermissionedSyncEndpointResolver {
  resolveSpaceHost(space: SpaceRef): Promise<string>;
  resolveRepoHost(repoDid: DID): Promise<string>;
}

export interface PermissionedListReposRequest {
  readonly serviceUrl: string;
  readonly space: SpaceRef;
  readonly credential: SpaceCredential;
  readonly cursor?: string;
  readonly limit: number;
}

export interface PermissionedListReposResponse {
  readonly repos: ReadonlyArray<PermissionedWriterSummary>;
  readonly cursor?: string;
}

export interface PermissionedListRepoOpsRequest {
  readonly serviceUrl: string;
  readonly space: SpaceRef;
  readonly repoDid: DID;
  readonly credential: SpaceCredential;
  readonly since?: string;
  readonly limit: number;
}

export interface PermissionedListRepoOpsResponse {
  readonly ops: ReadonlyArray<PermissionedRepoOperation>;
  readonly commit?: PermissionedSignedCommit;
}

export interface PermissionedRegisterNotifyRequest {
  readonly serviceUrl: string;
  readonly space: SpaceRef;
  readonly credential: SpaceCredential;
  readonly endpoint: string;
}

export interface PermissionedSyncXrpcClientPort {
  listRepos(
    request: PermissionedListReposRequest,
  ): Promise<PermissionedListReposResponse>;
  listRepoOps(
    request: PermissionedListRepoOpsRequest,
  ): Promise<PermissionedListRepoOpsResponse>;
  registerNotify(
    request: PermissionedRegisterNotifyRequest,
  ): Promise<{ readonly expiresAt: Date }>;
}

export interface PermissionedNotification {
  readonly space: SpaceRef;
  readonly repoDid: DID;
  readonly revision: string;
  readonly hash: Uint8Array;
  readonly receivedAt: Date;
}

export interface PermissionedNotificationSourcePort {
  subscribe(args: {
    readonly onNotification: (
      notification: PermissionedNotification,
    ) => Promise<void> | void;
  }): Promise<PermissionedWatchHandle> | PermissionedWatchHandle;
}

export interface PermissionedNotificationRegistration {
  readonly space: SpaceRef;
  readonly endpoint: string;
  readonly expiresAt: Date;
}

export interface PermissionedNotificationRegistrationStore {
  get(
    space: SpaceRef,
    endpoint: string,
  ): Promise<PermissionedNotificationRegistration | undefined>;
  put(registration: PermissionedNotificationRegistration): Promise<void>;
}

export class InMemoryPermissionedNotificationRegistrationStore implements PermissionedNotificationRegistrationStore {
  private readonly registrations = new Map<
    string,
    PermissionedNotificationRegistration
  >();

  async get(
    space: SpaceRef,
    endpoint: string,
  ): Promise<PermissionedNotificationRegistration | undefined> {
    return this.registrations.get(registrationKey(space, endpoint));
  }

  async put(registration: PermissionedNotificationRegistration): Promise<void> {
    this.registrations.set(
      registrationKey(registration.space, registration.endpoint),
      registration,
    );
  }
}

export interface PermissionedRecoveredRepo {
  readonly state: PermissionedReplicaState;
  readonly commit: PermissionedSignedCommit;
}

export interface PermissionedRepoRecoveryPort {
  recover(args: {
    readonly serviceUrl: string;
    readonly space: SpaceRef;
    readonly repoDid: DID;
    readonly credential: SpaceCredential;
    readonly cause: unknown;
  }): Promise<PermissionedRecoveredRepo>;
}

export class FailClosedPermissionedRepoRecoveryPort implements PermissionedRepoRecoveryPort {
  async recover(args: {
    readonly space: SpaceRef;
    readonly repoDid: DID;
  }): Promise<PermissionedRecoveredRepo> {
    throw new PermissionedSyncError(
      'recovery-unavailable',
      `Full CAR recovery is unavailable for ${formatSpaceRef(args.space)} repo ${args.repoDid}`,
    );
  }
}

export interface XrpcPermissionedRepoPortOptions extends ClockedOptions {
  readonly client: PermissionedSyncXrpcClientPort;
  readonly endpoints: PermissionedSyncEndpointResolver;
  readonly verifier: PermissionedCommitVerifierPort;
  readonly replicas?: PermissionedReplicaStore;
  readonly recovery?: PermissionedRepoRecoveryPort;
  readonly blobs?: PermissionedBlobVerifierPort;
  readonly notifications?: PermissionedNotificationSourcePort;
  readonly notificationEndpoint?: string;
  readonly registrations?: PermissionedNotificationRegistrationStore;
  readonly sweepIntervalMs?: number;
  readonly setInterval?: (
    callback: () => void,
    intervalMs: number,
  ) => ReturnType<typeof setInterval>;
  readonly clearInterval?: (handle: ReturnType<typeof setInterval>) => void;
  readonly onBackgroundError?: (
    error: unknown,
    context: { readonly space?: SpaceRef },
  ) => Promise<void> | void;
}

/**
 * Proposal 0016 pull adapter.
 *
 * Notifications are only wake-up hints. Every wake-up reconciles the
 * authority's writer inventory, pulls each writer's oplog, validates record
 * CIDs, recomputes LtHash, and verifies the head commit. Replica state is
 * staged until the consumer confirms that application projection succeeded.
 */
export class XrpcPermissionedRepoPort implements PermissionedRepoPort {
  private readonly replicas: PermissionedReplicaStore;
  private readonly recovery: PermissionedRepoRecoveryPort;
  private readonly blobs: PermissionedBlobVerifierPort;
  private readonly registrations: PermissionedNotificationRegistrationStore;
  private readonly pending = new Map<
    PermissionedCheckpoint,
    ReadonlyArray<PermissionedReplicaState>
  >();
  private readonly activeSpaces = new Map<string, SpaceRef>();
  private intervalHandle: ReturnType<typeof setInterval> | undefined;
  private notificationHandle: PermissionedWatchHandle | undefined;

  constructor(private readonly options: XrpcPermissionedRepoPortOptions) {
    this.replicas = options.replicas ?? new InMemoryPermissionedReplicaStore();
    this.recovery =
      options.recovery ?? new FailClosedPermissionedRepoRecoveryPort();
    this.blobs = options.blobs ?? new FailClosedPermissionedBlobVerifier();
    this.registrations =
      options.registrations ??
      new InMemoryPermissionedNotificationRegistrationStore();
  }

  async watch(args: {
    readonly spaces: ReadonlyArray<SpaceRef>;
    readonly onChange: (hint: PermissionedChangeHint) => Promise<void> | void;
  }): Promise<PermissionedWatchHandle> {
    for (const space of args.spaces) {
      this.activeSpaces.set(spaceRefKey(space), space);
    }

    if (this.options.notifications) {
      this.notificationHandle = await this.options.notifications.subscribe({
        onNotification: async (notification) => {
          if (!this.activeSpaces.has(spaceRefKey(notification.space))) return;
          await args.onChange({
            space: notification.space,
            repoDid: notification.repoDid,
            sourceRevision: notification.revision,
            sourceHash: notification.hash,
            receivedAt: notification.receivedAt,
          });
        },
      });
    }

    const intervalMs =
      this.options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
    if (intervalMs > 0 && args.spaces.length > 0) {
      const schedule = this.options.setInterval ?? globalThis.setInterval;
      this.intervalHandle = schedule(() => {
        for (const space of args.spaces) {
          Promise.resolve(
            args.onChange({
              space,
              receivedAt: this.options.clock(),
            }),
          ).catch((error) => {
            void this.options.onBackgroundError?.(error, { space });
          });
        }
      }, intervalMs);
      this.intervalHandle.unref?.();
    }

    return {
      close: async () => {
        for (const space of args.spaces) {
          this.activeSpaces.delete(spaceRefKey(space));
        }
        if (this.intervalHandle) {
          const clear = this.options.clearInterval ?? globalThis.clearInterval;
          clear(this.intervalHandle);
          this.intervalHandle = undefined;
        }
        await this.notificationHandle?.close();
        this.notificationHandle = undefined;
      },
    };
  }

  async sync(args: {
    readonly space: SpaceRef;
    readonly hint?: PermissionedChangeHint;
    readonly credential?: SpaceCredential;
  }): Promise<VerifiedPermissionedChanges> {
    if (!args.credential) {
      throw new PermissionedSyncError(
        'auth',
        'Permissioned repository sync requires a space credential',
      );
    }
    this.discardPendingForSpace(args.space);

    const spaceHost = normalizeServiceUrl(
      await this.options.endpoints.resolveSpaceHost(args.space),
    );
    await this.ensureNotificationRegistration(
      args.space,
      spaceHost,
      args.credential,
    );

    const writers = await this.listWriters({
      space: args.space,
      spaceHost,
      credential: args.credential,
    });
    const writerDids = new Set(writers.map((writer) => writer.did));
    const stagedStates: PermissionedReplicaState[] = [];
    const records: VerifiedPermissionedRecord[] = [];
    let resynced = false;

    for (const previous of await this.replicas.list(args.space)) {
      if (writerDids.has(previous.repoDid)) continue;
      const removed = {
        ...previous,
        records: [],
        removed: true,
      } satisfies PermissionedReplicaState;
      stagedStates.push(removed);
      records.push(...diffPermissionedReplica(previous, removed));
    }

    for (const writer of writers) {
      const result = await this.syncWriter({
        space: args.space,
        writer,
        credential: args.credential,
        hintedRevision:
          args.hint?.repoDid === writer.did
            ? args.hint.sourceRevision
            : undefined,
        hintedHash:
          args.hint?.repoDid === writer.did ? args.hint.sourceHash : undefined,
      });
      if (!result) continue;
      stagedStates.push(result.state);
      records.push(...result.changes);
      if (result.resynced) resynced = true;
    }

    if (stagedStates.length === 0) {
      return {
        space: args.space,
        records: [],
        verification: 'verified',
      };
    }

    const checkpoint = randomUUID() as PermissionedCheckpoint;
    this.pending.set(checkpoint, stagedStates);
    return {
      space: args.space,
      records,
      verification: resynced ? 'resynced' : 'verified',
      checkpoint,
      sourceRevision: maxRevision(stagedStates),
      ...(resynced ? { resynced: true } : {}),
    };
  }

  async commitCheckpoint(args: {
    readonly space: SpaceRef;
    readonly checkpoint: PermissionedCheckpoint;
  }): Promise<void> {
    const states = this.pending.get(args.checkpoint);
    if (!states) {
      throw new PermissionedSyncError(
        'protocol',
        'Unknown or already committed permissioned sync checkpoint',
      );
    }
    if (
      states.some(
        (state) => spaceRefKey(state.space) !== spaceRefKey(args.space),
      )
    ) {
      throw new PermissionedSyncError(
        'protocol',
        'Permissioned sync checkpoint belongs to a different space',
      );
    }

    await this.replicas.commit(states);
    this.pending.delete(args.checkpoint);
  }

  private async listWriters(args: {
    readonly space: SpaceRef;
    readonly spaceHost: string;
    readonly credential: SpaceCredential;
  }): Promise<ReadonlyArray<PermissionedWriterSummary>> {
    const writers = new Map<DID, PermissionedWriterSummary>();
    let cursor: string | undefined;
    do {
      const page = await this.options.client.listRepos({
        serviceUrl: args.spaceHost,
        space: args.space,
        credential: args.credential,
        cursor,
        limit: DEFAULT_PAGE_SIZE,
      });
      for (const writer of page.repos) writers.set(writer.did, writer);
      if (page.cursor && page.cursor === cursor) {
        throw new PermissionedSyncError(
          'protocol',
          `${LIST_REPOS_NSID} returned a non-advancing cursor`,
        );
      }
      cursor = page.cursor;
    } while (cursor);

    return [...writers.values()].sort((a, b) => a.did.localeCompare(b.did));
  }

  private async syncWriter(args: {
    readonly space: SpaceRef;
    readonly writer: PermissionedWriterSummary;
    readonly credential: SpaceCredential;
    readonly hintedRevision?: string;
    readonly hintedHash?: Uint8Array;
  }): Promise<{
    readonly state: PermissionedReplicaState;
    readonly changes: ReadonlyArray<VerifiedPermissionedRecord>;
    readonly resynced: boolean;
  } | null> {
    const previous =
      (await this.replicas.load(args.space, args.writer.did)) ??
      emptyReplica(args.space, args.writer.did);
    const previousHash = ltHashForReplica(previous.records).digest();
    const targetRevision = maxString(args.writer.rev, args.hintedRevision);
    const targetHash =
      targetRevision === args.writer.rev && args.writer.hash
        ? args.writer.hash
        : targetRevision === args.hintedRevision
          ? args.hintedHash
          : args.writer.hash;

    if (
      previous.revision &&
      targetRevision === previous.revision &&
      targetHash &&
      equalBytes(previousHash, targetHash)
    ) {
      return null;
    }

    const repoHost = normalizeServiceUrl(
      await this.options.endpoints.resolveRepoHost(args.writer.did),
    );
    try {
      const state = await this.incrementalSync({
        previous,
        repoHost,
        credential: args.credential,
        expectedRevision: targetRevision,
        expectedHash: targetHash,
      });
      await this.blobs.verify({
        serviceUrl: repoHost,
        space: args.space,
        repoDid: args.writer.did,
        credential: args.credential,
        records: state.records,
      });
      return {
        state,
        changes: diffPermissionedReplica(previous, state),
        resynced: false,
      };
    } catch (cause) {
      if (!isRecoveryCause(cause)) throw cause;
      const recovered = await this.recovery.recover({
        serviceUrl: repoHost,
        space: args.space,
        repoDid: args.writer.did,
        credential: args.credential,
        cause,
      });
      await this.verifyRecoveredRepo(recovered, args.space, args.writer.did);
      await this.blobs.verify({
        serviceUrl: repoHost,
        space: args.space,
        repoDid: args.writer.did,
        credential: args.credential,
        records: recovered.state.records,
      });
      if (targetRevision && recovered.commit.rev < targetRevision) {
        throw verificationError(
          'Recovered repository has not reached the announced revision',
        );
      }
      if (
        targetRevision === recovered.commit.rev &&
        targetHash &&
        !equalBytes(recovered.commit.hash, targetHash)
      ) {
        throw verificationError(
          'Recovered repository does not match the announced hash',
        );
      }
      return {
        state: recovered.state,
        changes: diffPermissionedReplica(previous, recovered.state),
        resynced: true,
      };
    }
  }

  private async incrementalSync(args: {
    readonly previous: PermissionedReplicaState;
    readonly repoHost: string;
    readonly credential: SpaceCredential;
    readonly expectedRevision?: string;
    readonly expectedHash?: Uint8Array;
  }): Promise<PermissionedReplicaState> {
    const records = new Map<string, MutableReplicaRecord>(
      args.previous.records.map((record) => [
        recordKey(record.collection, record.rkey),
        { ...record },
      ]),
    );
    const hash = ltHashForReplica(args.previous.records);
    let since = args.previous.revision;
    let latestRevision = since;

    for (;;) {
      const page = await this.options.client.listRepoOps({
        serviceUrl: args.repoHost,
        space: args.previous.space,
        repoDid: args.previous.repoDid,
        credential: args.credential,
        since,
        limit: DEFAULT_PAGE_SIZE,
      });

      for (const op of page.ops) {
        if (since && op.rev <= since) {
          throw verificationError(
            'Repository oplog did not advance beyond the requested revision',
          );
        }
        if (latestRevision && op.rev < latestRevision) {
          throw verificationError('Repository oplog revisions moved backward');
        }
        await applyOperation(records, hash, op);
        latestRevision = maxString(latestRevision, op.rev);
      }

      if (page.commit) {
        if (latestRevision && page.commit.rev !== latestRevision) {
          throw verificationError(
            'Head commit revision does not match the applied oplog',
          );
        }
        if (args.expectedRevision && page.commit.rev < args.expectedRevision) {
          throw verificationError(
            'Repository host has not reached the announced revision',
          );
        }
        if (
          args.expectedRevision === page.commit.rev &&
          args.expectedHash &&
          !equalBytes(page.commit.hash, args.expectedHash)
        ) {
          throw verificationError(
            'Repository commit does not match the announced hash',
          );
        }
        const verified = await this.options.verifier.verify({
          space: args.previous.space,
          repoDid: args.previous.repoDid,
          commit: page.commit,
          calculatedHash: hash.digest(),
        });
        if (!verified) {
          throw verificationError('Permissioned repository commit is invalid');
        }

        const finalized = finalizeRecords(records, page.commit.rev);
        return {
          space: args.previous.space,
          repoDid: args.previous.repoDid,
          revision: page.commit.rev,
          records: finalized,
        };
      }

      const pageRevision = maxRevisionFromOps(page.ops);
      if (!pageRevision || pageRevision === since) {
        throw verificationError('Repository oplog ended without a head commit');
      }
      since = pageRevision;
    }
  }

  private async verifyRecoveredRepo(
    recovered: PermissionedRecoveredRepo,
    expectedSpace: SpaceRef,
    expectedRepoDid: DID,
  ): Promise<void> {
    if (
      spaceRefKey(recovered.state.space) !== spaceRefKey(expectedSpace) ||
      recovered.state.repoDid !== expectedRepoDid ||
      recovered.state.revision !== recovered.commit.rev
    ) {
      throw verificationError('Recovered repository identity is invalid');
    }

    for (const record of recovered.state.records) {
      const cid = await cidForPermissionedRecord(record.record);
      if (cid !== record.cid) {
        throw verificationError(
          `Recovered record CID mismatch at ${record.collection}/${record.rkey}`,
        );
      }
    }
    const verified = await this.options.verifier.verify({
      space: recovered.state.space,
      repoDid: recovered.state.repoDid,
      commit: recovered.commit,
      calculatedHash: ltHashForReplica(recovered.state.records).digest(),
    });
    if (!verified) {
      throw verificationError('Recovered repository commit is invalid');
    }
  }

  private async ensureNotificationRegistration(
    space: SpaceRef,
    serviceUrl: string,
    credential: SpaceCredential,
  ): Promise<void> {
    const endpoint = this.options.notificationEndpoint;
    if (!endpoint) return;
    const current = await this.registrations.get(space, endpoint);
    if (
      current &&
      current.expiresAt.getTime() - this.options.clock().getTime() >
        REGISTRATION_REFRESH_BEFORE_MS
    ) {
      return;
    }

    try {
      const response = await this.options.client.registerNotify({
        serviceUrl,
        space,
        credential,
        endpoint,
      });
      await this.registrations.put({
        space,
        endpoint,
        expiresAt: response.expiresAt,
      });
    } catch (error) {
      await this.options.onBackgroundError?.(error, { space });
    }
  }

  private discardPendingForSpace(space: SpaceRef): void {
    const key = spaceRefKey(space);
    for (const [checkpoint, states] of this.pending) {
      if (states.some((state) => spaceRefKey(state.space) === key)) {
        this.pending.delete(checkpoint);
      }
    }
  }
}

interface MutableReplicaRecord {
  readonly collection: string;
  readonly rkey: string;
  readonly cid: CID;
  readonly record?: unknown;
  readonly sourceRevision?: string;
}

async function applyOperation(
  records: Map<string, MutableReplicaRecord>,
  hash: Proposal0016LtHash,
  op: PermissionedRepoOperation,
): Promise<void> {
  const key = recordKey(op.collection, op.rkey);
  const previous = records.get(key);
  const previousCid = previous?.cid ?? null;
  if (previousCid !== op.prev) {
    throw verificationError(
      `Repository oplog prev mismatch at ${op.collection}/${op.rkey}`,
    );
  }

  if (previous) {
    hash.remove(previous.collection, previous.rkey, previous.cid);
  }
  if (op.cid === null) {
    records.delete(key);
    return;
  }

  if (op.value !== undefined) {
    const actualCid = await cidForPermissionedRecord(op.value);
    if (actualCid !== op.cid) {
      throw verificationError(
        `Inline record CID mismatch at ${op.collection}/${op.rkey}`,
      );
    }
  }
  hash.add(op.collection, op.rkey, op.cid);
  records.set(key, {
    collection: op.collection,
    rkey: op.rkey,
    cid: op.cid,
    ...(op.value !== undefined
      ? { record: op.value }
      : previous?.cid === op.cid && previous.record !== undefined
        ? { record: previous.record }
        : {}),
    sourceRevision: op.rev,
  });
}

function finalizeRecords(
  records: Map<string, MutableReplicaRecord>,
  revision: string,
): ReadonlyArray<PermissionedReplicaRecord> {
  return [...records.values()]
    .map((record) => {
      if (record.record === undefined) {
        throw verificationError(
          `Current record value missing at ${record.collection}/${record.rkey}`,
        );
      }
      return {
        ...record,
        record: record.record,
        sourceRevision: record.sourceRevision ?? revision,
      };
    })
    .sort(
      (a, b) =>
        a.collection.localeCompare(b.collection) ||
        a.rkey.localeCompare(b.rkey),
    );
}

function emptyReplica(space: SpaceRef, repoDid: DID): PermissionedReplicaState {
  return { space, repoDid, records: [] };
}

function maxRevision(
  states: ReadonlyArray<PermissionedReplicaState>,
): string | undefined {
  return states.reduce<string | undefined>(
    (max, state) => maxString(max, state.revision),
    undefined,
  );
}

function maxRevisionFromOps(
  ops: ReadonlyArray<PermissionedRepoOperation>,
): string | undefined {
  return ops.reduce<string | undefined>(
    (max, op) => maxString(max, op.rev),
    undefined,
  );
}

function maxString(
  left: string | undefined,
  right: string | undefined,
): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function recordKey(collection: string, rkey: string): string {
  if (!collection || !rkey || collection.includes('/') || rkey.includes('/')) {
    throw verificationError('Repository oplog contains an invalid record path');
  }
  return `${collection}/${rkey}`;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function isRecoveryCause(error: unknown): boolean {
  return (
    error instanceof PermissionedSyncError &&
    (error.kind === 'verification' || error.kind === 'protocol')
  );
}

function verificationError(message: string): PermissionedSyncError {
  return new PermissionedSyncError('verification', message);
}

function registrationKey(space: SpaceRef, endpoint: string): string {
  return `${spaceRefKey(space)}|${endpoint}`;
}

function formatSpaceRef(space: SpaceRef): string {
  if (!space.expectedSpaceType) {
    throw new PermissionedSyncError(
      'invalid-space',
      'Permissioned XRPC requires SpaceRef.expectedSpaceType',
    );
  }
  return formatSpaceUri({
    spaceDid: space.arbiterDid,
    spaceType: space.expectedSpaceType,
    skey: space.spaceKey,
  });
}

function normalizeServiceUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PermissionedSyncError(
      'protocol',
      `Permissioned sync service URL is invalid: ${value}`,
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PermissionedSyncError(
      'protocol',
      `Permissioned sync service URL must use HTTP or HTTPS: ${value}`,
    );
  }
  return url.toString().replace(/\/+$/, '');
}

export interface XrpcPermissionedSyncFetchInit {
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface XrpcPermissionedSyncFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text?(): Promise<string>;
}

export type XrpcPermissionedSyncFetch = (
  url: string,
  init: XrpcPermissionedSyncFetchInit,
) => Promise<XrpcPermissionedSyncFetchResponse>;

export class XrpcPermissionedSyncClient implements PermissionedSyncXrpcClientPort {
  private readonly fetcher: XrpcPermissionedSyncFetch;

  constructor(fetcher?: XrpcPermissionedSyncFetch) {
    this.fetcher = fetcher ?? defaultFetch();
  }

  async listRepos(
    request: PermissionedListReposRequest,
  ): Promise<PermissionedListReposResponse> {
    const body = await this.getJson({
      nsid: LIST_REPOS_NSID,
      serviceUrl: request.serviceUrl,
      credential: request.credential,
      parameters: {
        space: formatSpaceRef(request.space),
        limit: String(request.limit),
        ...(request.cursor ? { cursor: request.cursor } : {}),
      },
    });
    const object = requireObject(body, LIST_REPOS_NSID);
    if (!Array.isArray(object.repos)) {
      throw protocolResponseError(LIST_REPOS_NSID, 'repos must be an array');
    }
    return {
      repos: object.repos.map(parseWriterSummary),
      ...(typeof object.cursor === 'string' ? { cursor: object.cursor } : {}),
    };
  }

  async listRepoOps(
    request: PermissionedListRepoOpsRequest,
  ): Promise<PermissionedListRepoOpsResponse> {
    const body = await this.getJson({
      nsid: LIST_REPO_OPS_NSID,
      serviceUrl: request.serviceUrl,
      credential: request.credential,
      parameters: {
        space: formatSpaceRef(request.space),
        repo: request.repoDid,
        limit: String(request.limit),
        ...(request.since ? { since: request.since } : {}),
      },
    });
    const object = requireObject(body, LIST_REPO_OPS_NSID);
    if (!Array.isArray(object.ops)) {
      throw protocolResponseError(LIST_REPO_OPS_NSID, 'ops must be an array');
    }
    return {
      ops: object.ops.map(parseRepoOperation),
      ...(object.commit ? { commit: parseSignedCommit(object.commit) } : {}),
    };
  }

  async registerNotify(
    request: PermissionedRegisterNotifyRequest,
  ): Promise<{ readonly expiresAt: Date }> {
    const body = await this.postJson({
      nsid: REGISTER_NOTIFY_NSID,
      serviceUrl: request.serviceUrl,
      credential: request.credential,
      body: {
        space: formatSpaceRef(request.space),
        endpoint: request.endpoint,
      },
    });
    const object = requireObject(body, REGISTER_NOTIFY_NSID);
    if (typeof object.expiresAt !== 'string') {
      throw protocolResponseError(
        REGISTER_NOTIFY_NSID,
        'expiresAt must be a datetime',
      );
    }
    const expiresAt = new Date(object.expiresAt);
    if (!Number.isFinite(expiresAt.getTime())) {
      throw protocolResponseError(
        REGISTER_NOTIFY_NSID,
        'expiresAt must be a valid datetime',
      );
    }
    return { expiresAt };
  }

  private async getJson(args: {
    readonly nsid: string;
    readonly serviceUrl: string;
    readonly credential: SpaceCredential;
    readonly parameters: Readonly<Record<string, string>>;
  }): Promise<unknown> {
    const query = new URLSearchParams(args.parameters);
    return this.requestJson(
      `${args.serviceUrl}/xrpc/${args.nsid}?${query.toString()}`,
      {
        method: 'GET',
        headers: credentialHeaders(args.credential),
      },
      args.nsid,
    );
  }

  private async postJson(args: {
    readonly nsid: string;
    readonly serviceUrl: string;
    readonly credential: SpaceCredential;
    readonly body: JsonObject;
  }): Promise<unknown> {
    return this.requestJson(
      `${args.serviceUrl}/xrpc/${args.nsid}`,
      {
        method: 'POST',
        headers: {
          ...credentialHeaders(args.credential),
          'content-type': 'application/json',
        },
        body: JSON.stringify(args.body),
      },
      args.nsid,
    );
  }

  private async requestJson(
    url: string,
    init: XrpcPermissionedSyncFetchInit,
    nsid: string,
  ): Promise<unknown> {
    let response: XrpcPermissionedSyncFetchResponse;
    try {
      response = await this.fetcher(url, init);
    } catch (error) {
      throw new PermissionedSyncError(
        'unavailable',
        `${nsid} request failed: ${errorMessage(error)}`,
      );
    }
    const body = await responseBody(response);
    if (!response.ok) {
      const object = asObject(body);
      const message =
        typeof object?.message === 'string'
          ? object.message
          : `${nsid} failed with HTTP ${response.status}`;
      const kind =
        response.status === 401 || response.status === 403
          ? 'auth'
          : response.status >= 500
            ? 'unavailable'
            : 'protocol';
      throw new PermissionedSyncError(kind, message);
    }
    return body;
  }
}

function parseWriterSummary(value: unknown): PermissionedWriterSummary {
  const object = requireObject(value, LIST_REPOS_NSID);
  if (typeof object.did !== 'string' || !object.did.startsWith('did:')) {
    throw protocolResponseError(LIST_REPOS_NSID, 'repo did is invalid');
  }
  return {
    did: object.did as DID,
    ...(typeof object.rev === 'string' ? { rev: object.rev } : {}),
    ...(object.hash !== undefined
      ? { hash: parseBytes(object.hash, 'repo hash') }
      : {}),
  };
}

function parseRepoOperation(value: unknown): PermissionedRepoOperation {
  const object = requireObject(value, LIST_REPO_OPS_NSID);
  if (
    typeof object.rev !== 'string' ||
    typeof object.collection !== 'string' ||
    typeof object.rkey !== 'string' ||
    !isNullableString(object.cid) ||
    !isNullableString(object.prev)
  ) {
    throw protocolResponseError(
      LIST_REPO_OPS_NSID,
      'op is missing required fields',
    );
  }
  return {
    rev: object.rev,
    collection: object.collection,
    rkey: object.rkey,
    cid: object.cid as CID | null,
    prev: object.prev as CID | null,
    ...('value' in object ? { value: object.value } : {}),
  };
}

function parseSignedCommit(value: unknown): PermissionedSignedCommit {
  const object = requireObject(value, LIST_REPO_OPS_NSID);
  if (typeof object.ver !== 'number' || typeof object.rev !== 'string') {
    throw protocolResponseError(
      LIST_REPO_OPS_NSID,
      'commit is missing ver or rev',
    );
  }
  return {
    ver: object.ver,
    rev: object.rev,
    hash: parseBytes(object.hash, 'commit hash'),
    mac: parseBytes(object.mac, 'commit mac'),
    ikm: parseBytes(object.ikm, 'commit ikm'),
    sig: parseBytes(object.sig, 'commit signature'),
  };
}

function parseBytes(value: unknown, field: string): Uint8Array {
  const encoded =
    typeof value === 'string'
      ? value
      : typeof asObject(value)?.$bytes === 'string'
        ? (asObject(value)!.$bytes as string)
        : null;
  if (!encoded) {
    throw protocolResponseError(
      LIST_REPO_OPS_NSID,
      `${field} must be encoded bytes`,
    );
  }
  try {
    return Uint8Array.from(Buffer.from(encoded, 'base64url'));
  } catch {
    throw protocolResponseError(
      LIST_REPO_OPS_NSID,
      `${field} has invalid byte encoding`,
    );
  }
}

function requireObject(value: unknown, nsid: string): JsonObject {
  const object = asObject(value);
  if (!object) {
    throw protocolResponseError(nsid, 'response must be an object');
  }
  return object;
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonObject;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function protocolResponseError(
  nsid: string,
  message: string,
): PermissionedSyncError {
  return new PermissionedSyncError('protocol', `${nsid}: ${message}`);
}

function credentialHeaders(
  credential: SpaceCredential,
): Record<string, string> {
  return {
    accept: 'application/json',
    authorization: `Bearer ${credential.token}`,
  };
}

async function responseBody(
  response: XrpcPermissionedSyncFetchResponse,
): Promise<unknown> {
  if (response.text) {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function defaultFetch(): XrpcPermissionedSyncFetch {
  const fetcher = (globalThis as { fetch?: XrpcPermissionedSyncFetch }).fetch;
  if (!fetcher) {
    throw new Error('XrpcPermissionedSyncClient requires fetch');
  }
  return fetcher;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function spaceRefFromPermissionedNotification(
  spaceUri: string,
): SpaceRef {
  const parsed = parseSpaceUri(spaceUri);
  if (!parsed) {
    throw new PermissionedSyncError(
      'invalid-space',
      `Invalid permissioned space URI: ${spaceUri}`,
    );
  }
  return {
    arbiterDid: parsed.spaceDid as DID,
    expectedSpaceType: parsed.spaceType,
    spaceKey: parsed.skey,
  };
}
