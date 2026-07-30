import type { CID, DID } from '@coopsource/common';
import { SPACE_XRPC_METHODS } from '@coopsource/lexicons';
import { CID as MultiformatsCid } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import type { SpaceCredential } from './credential-store.js';
import {
  PermissionedSyncError,
  type PermissionedReplicaRecord,
} from './permissioned-sync.js';
import { formatSpaceUri } from './space-uri.js';
import type { SpaceRef } from './types.js';

const GET_BLOB_NSID = SPACE_XRPC_METHODS.getBlob;
const SHA2_256_CODE = 0x12;

export interface PermissionedBlobVerificationRequest {
  readonly serviceUrl: string;
  readonly space: SpaceRef;
  readonly repoDid: DID;
  readonly credential: SpaceCredential;
  readonly records: ReadonlyArray<PermissionedReplicaRecord>;
}

export interface PermissionedBlobVerifierPort {
  verify(request: PermissionedBlobVerificationRequest): Promise<void>;
}

export class FailClosedPermissionedBlobVerifier implements PermissionedBlobVerifierPort {
  async verify(request: PermissionedBlobVerificationRequest): Promise<void> {
    if (blobRefs(request.records).length === 0) return;
    throw new PermissionedSyncError(
      'verification',
      `Permissioned repo ${request.repoDid} contains blobs but no blob verifier is configured`,
    );
  }
}

export interface PermissionedBlobFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  text?(): Promise<string>;
}

export type PermissionedBlobFetch = (
  url: string,
  init: {
    readonly method: 'GET';
    readonly headers: Readonly<Record<string, string>>;
  },
) => Promise<PermissionedBlobFetchResponse>;

export class XrpcPermissionedBlobVerifier implements PermissionedBlobVerifierPort {
  private readonly fetcher: PermissionedBlobFetch;

  constructor(fetcher?: PermissionedBlobFetch) {
    this.fetcher = fetcher ?? defaultFetch();
  }

  async verify(request: PermissionedBlobVerificationRequest): Promise<void> {
    const refs = blobRefs(request.records);
    for (const ref of refs) {
      const url = new URL(
        `${request.serviceUrl.replace(/\/+$/, '')}/xrpc/${GET_BLOB_NSID}`,
      );
      url.searchParams.set('space', formatSpaceRef(request.space));
      url.searchParams.set('repo', request.repoDid);
      url.searchParams.set('cid', ref.cid);

      let response: PermissionedBlobFetchResponse;
      try {
        response = await this.fetcher(url.toString(), {
          method: 'GET',
          headers: {
            accept: '*/*',
            authorization: `Bearer ${request.credential.token}`,
          },
        });
      } catch (error) {
        throw new PermissionedSyncError(
          'unavailable',
          `${GET_BLOB_NSID} request failed: ${errorMessage(error)}`,
        );
      }
      if (!response.ok) {
        const message = response.text
          ? await response.text().catch(() => '')
          : '';
        throw new PermissionedSyncError(
          response.status === 401 || response.status === 403
            ? 'auth'
            : response.status >= 500
              ? 'unavailable'
              : 'verification',
          message || `${GET_BLOB_NSID} failed with HTTP ${response.status}`,
        );
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (ref.size !== undefined && bytes.length !== ref.size) {
        throw verificationError(
          `Blob ${ref.cid} size mismatch: expected ${ref.size}, received ${bytes.length}`,
        );
      }
      await verifyBlobCid(ref.cid, bytes);
    }
  }
}

interface BlobRef {
  readonly cid: CID;
  readonly size?: number;
}

function blobRefs(
  records: ReadonlyArray<PermissionedReplicaRecord>,
): ReadonlyArray<BlobRef> {
  const refs = new Map<CID, BlobRef>();
  const visited = new Set<object>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (visited.has(value)) return;
    visited.add(value);

    const object = value as Record<string, unknown>;
    if (object.$type === 'blob') {
      const cid = blobCid(object.ref);
      if (!cid) {
        throw verificationError('Blob reference is missing a CID');
      }
      const size =
        typeof object.size === 'number' &&
        Number.isSafeInteger(object.size) &&
        object.size >= 0
          ? object.size
          : undefined;
      refs.set(cid, { cid, ...(size !== undefined ? { size } : {}) });
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    for (const child of Object.values(object)) visit(child);
  };

  for (const record of records) visit(record.record);
  return [...refs.values()].sort((left, right) =>
    left.cid.localeCompare(right.cid),
  );
}

function blobCid(value: unknown): CID | undefined {
  const cid = MultiformatsCid.asCID(value);
  if (cid) return cid.toString() as CID;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const link = (value as Record<string, unknown>).$link;
  return typeof link === 'string' ? (link as CID) : undefined;
}

async function verifyBlobCid(cidValue: CID, bytes: Uint8Array): Promise<void> {
  let cid: MultiformatsCid;
  try {
    cid = MultiformatsCid.parse(cidValue);
  } catch {
    throw verificationError(`Blob CID is invalid: ${cidValue}`);
  }
  if (cid.multihash.code !== SHA2_256_CODE) {
    throw verificationError(
      `Blob ${cidValue} uses unsupported multihash ${cid.multihash.code}`,
    );
  }
  const digest = await sha256.digest(bytes);
  if (!equalBytes(cid.multihash.digest, digest.digest)) {
    throw verificationError(`Blob ${cidValue} content does not match its CID`);
  }
}

function formatSpaceRef(space: SpaceRef): string {
  if (!space.expectedSpaceType) {
    throw new PermissionedSyncError(
      'invalid-space',
      'Blob verification requires SpaceRef.expectedSpaceType',
    );
  }
  return formatSpaceUri({
    spaceDid: space.arbiterDid,
    spaceType: space.expectedSpaceType,
    skey: space.spaceKey,
  });
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function verificationError(message: string): PermissionedSyncError {
  return new PermissionedSyncError('verification', message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultFetch(): PermissionedBlobFetch {
  const fetcher = (globalThis as { fetch?: PermissionedBlobFetch }).fetch;
  if (!fetcher) {
    throw new Error('XrpcPermissionedBlobVerifier requires fetch');
  }
  return fetcher;
}
