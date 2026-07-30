import { timingSafeEqual } from 'node:crypto';
import type { CID, DID } from '@coopsource/common';
import { verifySignature } from '@atproto/crypto';
import { cidForLex } from '@atproto/lex-cbor';
import { blake3 } from '@noble/hashes/blake3';
import { expand } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { formatSpaceUri } from './space-uri.js';
import type {
  PermissionedRecordLocation,
  SpaceRef,
  VerifiedPermissionedRecord,
} from './types.js';

const LT_HASH_LANES = 1024;
const LT_HASH_STATE_BYTES = LT_HASH_LANES * 2;
const COMMIT_VERSION = 1;
const COMMIT_CONTEXT_PREFIX = new TextEncoder().encode('atproto-space-v1');

if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) {
  throw new Error('Proposal 0016 LtHash requires a little-endian host');
}

export interface PermissionedSignedCommit {
  readonly ver: number;
  readonly hash: Uint8Array;
  readonly mac: Uint8Array;
  readonly ikm: Uint8Array;
  readonly sig: Uint8Array;
  readonly rev: string;
}

export interface PermissionedRepoOperation {
  readonly rev: string;
  readonly collection: string;
  readonly rkey: string;
  readonly cid: CID | null;
  readonly prev: CID | null;
  readonly value?: unknown;
}

export interface PermissionedWriterSummary {
  readonly did: DID;
  readonly rev?: string;
  readonly hash?: Uint8Array;
}

export interface PermissionedReplicaRecord {
  readonly collection: string;
  readonly rkey: string;
  readonly cid: CID;
  readonly record: unknown;
  readonly sourceRevision?: string;
}

export interface PermissionedReplicaState {
  readonly space: SpaceRef;
  readonly repoDid: DID;
  readonly revision?: string;
  readonly records: ReadonlyArray<PermissionedReplicaRecord>;
  readonly removed?: boolean;
}

export interface PermissionedReplicaStore {
  list(space: SpaceRef): Promise<ReadonlyArray<PermissionedReplicaState>>;
  load(
    space: SpaceRef,
    repoDid: DID,
  ): Promise<PermissionedReplicaState | undefined>;
  commit(states: ReadonlyArray<PermissionedReplicaState>): Promise<void>;
}

export class InMemoryPermissionedReplicaStore implements PermissionedReplicaStore {
  private readonly states = new Map<string, PermissionedReplicaState>();

  async list(
    space: SpaceRef,
  ): Promise<ReadonlyArray<PermissionedReplicaState>> {
    const prefix = `${replicaSpaceKey(space)}|`;
    return [...this.states.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, state]) => cloneReplicaState(state))
      .sort((a, b) => a.repoDid.localeCompare(b.repoDid));
  }

  async load(
    space: SpaceRef,
    repoDid: DID,
  ): Promise<PermissionedReplicaState | undefined> {
    const state = this.states.get(replicaKey(space, repoDid));
    return state ? cloneReplicaState(state) : undefined;
  }

  async commit(states: ReadonlyArray<PermissionedReplicaState>): Promise<void> {
    for (const state of states) {
      const key = replicaKey(state.space, state.repoDid);
      if (state.removed) {
        this.states.delete(key);
      } else {
        this.states.set(key, cloneReplicaState(state));
      }
    }
  }
}

export interface PermissionedCommitVerificationRequest {
  readonly space: SpaceRef;
  readonly repoDid: DID;
  readonly commit: PermissionedSignedCommit;
  readonly calculatedHash: Uint8Array;
}

export interface PermissionedCommitVerifierPort {
  verify(request: PermissionedCommitVerificationRequest): Promise<boolean>;
}

export interface PermissionedRepoSigningKeyResolver {
  resolveSigningKey(repoDid: DID): Promise<string>;
}

export class Proposal0016CommitVerifier implements PermissionedCommitVerifierPort {
  constructor(
    private readonly signingKeys: PermissionedRepoSigningKeyResolver,
  ) {}

  async verify(
    request: PermissionedCommitVerificationRequest,
  ): Promise<boolean> {
    const { commit } = request;
    if (
      commit.ver !== COMMIT_VERSION ||
      commit.hash.length !== 32 ||
      commit.mac.length !== 32 ||
      commit.ikm.length !== 32 ||
      commit.sig.length === 0 ||
      request.calculatedHash.length !== 32
    ) {
      return false;
    }

    if (!equalBytes(commit.hash, request.calculatedHash)) return false;

    const context = encodePermissionedCommitContext({
      space: request.space,
      repoDid: request.repoDid,
      revision: commit.rev,
      ikm: commit.ikm,
    });
    const key = expand(sha256, commit.ikm, context, 32);
    const expectedMac = hmac(sha256, key, commit.hash);
    if (!equalBytes(commit.mac, expectedMac)) return false;

    const signingKey = await this.signingKeys.resolveSigningKey(
      request.repoDid,
    );
    return verifySignature(signingKey, context, commit.sig);
  }
}

export interface PermissionedCommitContext {
  readonly space: SpaceRef;
  readonly repoDid: DID;
  readonly revision: string;
  readonly ikm: Uint8Array;
}

export function encodePermissionedCommitContext(
  context: PermissionedCommitContext,
): Uint8Array {
  if (!context.space.expectedSpaceType) {
    throw new PermissionedSyncError(
      'invalid-space',
      'Commit verification requires SpaceRef.expectedSpaceType',
    );
  }

  const fields = [
    new TextEncoder().encode(
      formatSpaceUri({
        spaceDid: context.space.arbiterDid,
        spaceType: context.space.expectedSpaceType,
        skey: context.space.spaceKey,
      }),
    ),
    new TextEncoder().encode(context.repoDid),
    new TextEncoder().encode(context.revision),
    context.ikm,
  ];
  const length = fields.reduce(
    (total, field) => total + 2 + field.length,
    COMMIT_CONTEXT_PREFIX.length,
  );
  const output = new Uint8Array(length);
  output.set(COMMIT_CONTEXT_PREFIX);
  let offset = COMMIT_CONTEXT_PREFIX.length;
  for (const field of fields) {
    if (field.length > 0xffff) {
      throw new PermissionedSyncError(
        'protocol',
        'Commit context field exceeds uint16 length',
      );
    }
    output[offset] = field.length >>> 8;
    output[offset + 1] = field.length & 0xff;
    output.set(field, offset + 2);
    offset += 2 + field.length;
  }
  return output;
}

export class Proposal0016LtHash {
  private readonly bytes: Uint8Array;
  private readonly lanes: Uint16Array;

  constructor(initialState?: Uint8Array) {
    if (initialState && initialState.length !== LT_HASH_STATE_BYTES) {
      throw new PermissionedSyncError(
        'protocol',
        `LtHash state must be ${LT_HASH_STATE_BYTES} bytes`,
      );
    }
    const buffer = new ArrayBuffer(LT_HASH_STATE_BYTES);
    this.bytes = new Uint8Array(buffer);
    this.lanes = new Uint16Array(buffer);
    if (initialState) this.bytes.set(initialState);
  }

  add(collection: string, rkey: string, cid: string): void {
    this.apply(collection, rkey, cid, 1);
  }

  remove(collection: string, rkey: string, cid: string): void {
    this.apply(collection, rkey, cid, -1);
  }

  digest(): Uint8Array {
    return sha256(this.bytes);
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }

  private apply(
    collection: string,
    rkey: string,
    cid: string,
    direction: 1 | -1,
  ): void {
    const element = new TextEncoder().encode(`${collection}/${rkey}/${cid}`);
    const expanded = blake3(element, { dkLen: LT_HASH_STATE_BYTES });
    const expandedLanes = new Uint16Array(
      expanded.buffer,
      expanded.byteOffset,
      LT_HASH_LANES,
    );
    for (let i = 0; i < LT_HASH_LANES; i += 1) {
      if (direction === 1) {
        this.lanes[i] += expandedLanes[i]!;
      } else {
        this.lanes[i] -= expandedLanes[i]!;
      }
    }
  }
}

export function ltHashForReplica(
  records: ReadonlyArray<PermissionedReplicaRecord>,
): Proposal0016LtHash {
  const hash = new Proposal0016LtHash();
  for (const record of records) {
    hash.add(record.collection, record.rkey, record.cid);
  }
  return hash;
}

export async function cidForPermissionedRecord(record: unknown): Promise<CID> {
  return (
    await cidForLex(record as Parameters<typeof cidForLex>[0])
  ).toString() as CID;
}

export function diffPermissionedReplica(
  previous: PermissionedReplicaState,
  next: PermissionedReplicaState,
): ReadonlyArray<VerifiedPermissionedRecord> {
  const previousRecords = recordMap(previous.records);
  const nextRecords = recordMap(next.records);
  const changes: VerifiedPermissionedRecord[] = [];

  for (const [key, record] of nextRecords) {
    const old = previousRecords.get(key);
    if (old?.cid === record.cid) continue;
    changes.push({
      operation: old ? 'update' : 'create',
      location: locationFor(next, record),
      cid: record.cid,
      record: record.record,
      sourceRevision: record.sourceRevision ?? next.revision,
    });
  }

  for (const [key, record] of previousRecords) {
    if (nextRecords.has(key)) continue;
    changes.push({
      operation: 'delete',
      location: locationFor(previous, record),
      previousCid: record.cid,
      sourceRevision: next.revision,
    });
  }

  return changes.sort(compareChanges);
}

export type PermissionedSyncErrorKind =
  | 'auth'
  | 'invalid-space'
  | 'protocol'
  | 'verification'
  | 'recovery-unavailable'
  | 'unavailable';

export class PermissionedSyncError extends Error {
  constructor(
    public readonly kind: PermissionedSyncErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'PermissionedSyncError';
  }
}

function replicaKey(space: SpaceRef, repoDid: DID): string {
  return `${replicaSpaceKey(space)}|${repoDid}`;
}

function replicaSpaceKey(space: SpaceRef): string {
  return [space.arbiterDid, space.expectedSpaceType ?? '', space.spaceKey].join(
    '|',
  );
}

function cloneReplicaState(
  state: PermissionedReplicaState,
): PermissionedReplicaState {
  return {
    ...state,
    records: state.records.map((record) => ({ ...record })),
  };
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function recordMap(
  records: ReadonlyArray<PermissionedReplicaRecord>,
): Map<string, PermissionedReplicaRecord> {
  return new Map(
    records.map((record) => [`${record.collection}/${record.rkey}`, record]),
  );
}

function locationFor(
  state: PermissionedReplicaState,
  record: PermissionedReplicaRecord,
): PermissionedRecordLocation {
  return {
    space: state.space,
    authorDid: state.repoDid,
    collection: record.collection,
    rkey: record.rkey,
  };
}

function compareChanges(
  left: VerifiedPermissionedRecord,
  right: VerifiedPermissionedRecord,
): number {
  return (
    left.location.authorDid.localeCompare(right.location.authorDid) ||
    left.location.collection.localeCompare(right.location.collection) ||
    left.location.rkey.localeCompare(right.location.rkey)
  );
}
