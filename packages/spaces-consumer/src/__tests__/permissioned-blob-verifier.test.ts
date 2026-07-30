import type { DID } from '@coopsource/common';
import * as raw from 'multiformats/codecs/raw';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import { describe, expect, it, vi } from 'vitest';
import {
  FailClosedPermissionedBlobVerifier,
  XrpcPermissionedBlobVerifier,
  type PermissionedBlobFetch,
} from '../permissioned-blob-verifier.js';
import type { PermissionedReplicaRecord } from '../permissioned-sync.js';
import type { SpaceRef } from '../types.js';

const space: SpaceRef = {
  arbiterDid: 'did:plc:coop' as DID,
  expectedSpaceType: 'app.example.space',
  spaceKey: 'members',
};
const repoDid = 'did:plc:alice' as DID;
const credential = {
  token: 'space-token',
  expiresAt: new Date('2026-07-30T13:00:00Z'),
};

describe('permissioned blob verification', () => {
  it('fetches each referenced blob and verifies its size and CID', async () => {
    const bytes = new TextEncoder().encode('blob contents');
    const cid = CID.createV1(raw.code, await sha256.digest(bytes));
    const fetcher = blobFetch(bytes);
    const verifier = new XrpcPermissionedBlobVerifier(fetcher);

    await verifier.verify(
      request([
        record({
          attachment: {
            $type: 'blob',
            ref: { $link: cid.toString() },
            mimeType: 'text/plain',
            size: bytes.length,
          },
        }),
      ]),
    );

    expect(fetcher).toHaveBeenCalledWith(
      `https://repo.example/xrpc/com.atproto.space.getBlob?space=at%3A%2F%2Fdid%3Aplc%3Acoop%2Fspace%2Fapp.example.space%2Fmembers&repo=did%3Aplc%3Aalice&cid=${cid.toString()}`,
      {
        method: 'GET',
        headers: {
          accept: '*/*',
          authorization: 'Bearer space-token',
        },
      },
    );
  });

  it('fails closed when fetched content does not match its CID', async () => {
    const expected = new TextEncoder().encode('expected');
    const cid = CID.createV1(raw.code, await sha256.digest(expected));
    const verifier = new XrpcPermissionedBlobVerifier(
      blobFetch(new TextEncoder().encode('tampered')),
    );

    await expect(
      verifier.verify(
        request([
          record({
            attachment: {
              $type: 'blob',
              ref: { $link: cid.toString() },
            },
          }),
        ]),
      ),
    ).rejects.toThrow('content does not match its CID');
  });

  it('allows blob-free records but rejects blobs without a configured verifier', async () => {
    const verifier = new FailClosedPermissionedBlobVerifier();

    await expect(
      verifier.verify(request([record({ value: 'no blob' })])),
    ).resolves.toBeUndefined();
    await expect(
      verifier.verify(
        request([
          record({
            attachment: {
              $type: 'blob',
              ref: { $link: 'bafy-unverified' },
            },
          }),
        ]),
      ),
    ).rejects.toThrow('no blob verifier is configured');
  });
});

function request(records: PermissionedReplicaRecord[]) {
  return {
    serviceUrl: 'https://repo.example',
    space,
    repoDid,
    credential,
    records,
  };
}

function record(value: unknown): PermissionedReplicaRecord {
  return {
    collection: 'app.example.record',
    rkey: 'one',
    cid: 'bafy-record' as never,
    record: value,
    sourceRevision: '3',
  };
}

function blobFetch(bytes: Uint8Array) {
  return vi.fn<PermissionedBlobFetch>(async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
  }));
}
