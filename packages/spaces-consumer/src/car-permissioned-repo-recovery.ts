import type { CID, DID } from '@coopsource/common';
import { SPACE_XRPC_METHODS } from '@coopsource/lexicons';
import { CarReader } from '@ipld/car';
import * as dagCbor from '@ipld/dag-cbor';
import { CID as MultiformatsCid } from 'multiformats/cid';
import {
  PermissionedSyncError,
  type PermissionedReplicaRecord,
  type PermissionedSignedCommit,
} from './permissioned-sync.js';
import { formatSpaceUri } from './space-uri.js';
import type {
  PermissionedRecoveredRepo,
  PermissionedRepoRecoveryPort,
} from './xrpc-permissioned-repo-port.js';
import type { SpaceCredential } from './credential-store.js';
import type { SpaceRef } from './types.js';

const GET_REPO_NSID = SPACE_XRPC_METHODS.getRepo;

export interface PermissionedCarFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  text?(): Promise<string>;
}

export type PermissionedCarFetch = (
  url: string,
  init: {
    readonly method: 'GET';
    readonly headers: Readonly<Record<string, string>>;
  },
) => Promise<PermissionedCarFetchResponse>;

export class XrpcCarPermissionedRepoRecoveryPort implements PermissionedRepoRecoveryPort {
  private readonly fetcher: PermissionedCarFetch;

  constructor(fetcher?: PermissionedCarFetch) {
    this.fetcher = fetcher ?? defaultFetch();
  }

  async recover(args: {
    readonly serviceUrl: string;
    readonly space: SpaceRef;
    readonly repoDid: DID;
    readonly credential: SpaceCredential;
    readonly cause: unknown;
  }): Promise<PermissionedRecoveredRepo> {
    const url = new URL(
      `${args.serviceUrl.replace(/\/+$/, '')}/xrpc/${GET_REPO_NSID}`,
    );
    url.searchParams.set('space', formatSpaceRef(args.space));
    url.searchParams.set('repo', args.repoDid);

    let response: PermissionedCarFetchResponse;
    try {
      response = await this.fetcher(url.toString(), {
        method: 'GET',
        headers: {
          accept: 'application/vnd.ipld.car',
          authorization: `Bearer ${args.credential.token}`,
        },
      });
    } catch (error) {
      throw new PermissionedSyncError(
        'unavailable',
        `${GET_REPO_NSID} request failed: ${errorMessage(error)}`,
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
            : 'protocol',
        message || `${GET_REPO_NSID} failed with HTTP ${response.status}`,
      );
    }

    let reader: CarReader;
    try {
      reader = await CarReader.fromBytes(
        new Uint8Array(await response.arrayBuffer()),
      );
    } catch (error) {
      throw verificationError(`Invalid repository CAR: ${errorMessage(error)}`);
    }
    const roots = await reader.getRoots();
    if (roots.length !== 2) {
      throw verificationError(
        `Repository CAR must have two roots, received ${roots.length}`,
      );
    }
    const [commitCid, indexCid] = roots;
    if (!commitCid || !indexCid) {
      throw verificationError('Repository CAR roots are incomplete');
    }

    const commitBlock = await reader.get(commitCid);
    const indexBlock = await reader.get(indexCid);
    if (!commitBlock || !indexBlock) {
      throw verificationError('Repository CAR is missing a root block');
    }

    const commit = decodeCommit(commitBlock.bytes);
    const index = decodeIndex(indexBlock.bytes);
    const records: PermissionedReplicaRecord[] = [];
    for (const [path, cid] of index) {
      const location = parseRecordPath(path);
      const block = await reader.get(cid);
      if (!block) {
        throw verificationError(`Repository CAR is missing record ${path}`);
      }
      let record: unknown;
      try {
        record = dagCbor.decode(block.bytes);
      } catch (error) {
        throw verificationError(
          `Repository CAR record ${path} is invalid DAG-CBOR: ${errorMessage(error)}`,
        );
      }
      records.push({
        ...location,
        cid: cid.toString() as CID,
        record,
        sourceRevision: commit.rev,
      });
    }

    return {
      commit,
      state: {
        space: args.space,
        repoDid: args.repoDid,
        revision: commit.rev,
        records,
      },
    };
  }
}

function decodeCommit(bytes: Uint8Array): PermissionedSignedCommit {
  let value: unknown;
  try {
    value = dagCbor.decode(bytes);
  } catch (error) {
    throw verificationError(
      `Repository commit is invalid DAG-CBOR: ${errorMessage(error)}`,
    );
  }
  const object = asObject(value);
  if (
    !object ||
    typeof object.ver !== 'number' ||
    typeof object.rev !== 'string' ||
    !(object.hash instanceof Uint8Array) ||
    !(object.mac instanceof Uint8Array) ||
    !(object.ikm instanceof Uint8Array) ||
    !(object.sig instanceof Uint8Array)
  ) {
    throw verificationError('Repository commit is missing required fields');
  }
  return {
    ver: object.ver,
    rev: object.rev,
    hash: object.hash,
    mac: object.mac,
    ikm: object.ikm,
    sig: object.sig,
  };
}

function decodeIndex(
  bytes: Uint8Array,
): ReadonlyArray<readonly [string, MultiformatsCid]> {
  let value: unknown;
  try {
    value = dagCbor.decode(bytes);
  } catch (error) {
    throw verificationError(
      `Repository index is invalid DAG-CBOR: ${errorMessage(error)}`,
    );
  }
  const object = asObject(value);
  if (!object) {
    throw verificationError('Repository index must be a DAG-CBOR map');
  }
  return Object.entries(object)
    .map(([path, link]) => {
      const cid = MultiformatsCid.asCID(link);
      if (!cid) {
        throw verificationError(
          `Repository index entry ${path} is not a CID link`,
        );
      }
      return [path, cid] as const;
    })
    .sort(([left], [right]) => left.localeCompare(right));
}

function parseRecordPath(path: string): {
  readonly collection: string;
  readonly rkey: string;
} {
  const parts = path.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw verificationError(`Repository index path is invalid: ${path}`);
  }
  return { collection: parts[0], rkey: parts[1] };
}

function formatSpaceRef(space: SpaceRef): string {
  if (!space.expectedSpaceType) {
    throw new PermissionedSyncError(
      'invalid-space',
      'Full repo recovery requires SpaceRef.expectedSpaceType',
    );
  }
  return formatSpaceUri({
    spaceDid: space.arbiterDid,
    spaceType: space.expectedSpaceType,
    skey: space.spaceKey,
  });
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function verificationError(message: string): PermissionedSyncError {
  return new PermissionedSyncError('verification', message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultFetch(): PermissionedCarFetch {
  const fetcher = (globalThis as { fetch?: PermissionedCarFetch }).fetch;
  if (!fetcher) {
    throw new Error('XrpcCarPermissionedRepoRecoveryPort requires fetch');
  }
  return fetcher;
}
