import type { DID } from '@coopsource/common';
import { CarWriter } from '@ipld/car';
import * as dagCbor from '@ipld/dag-cbor';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import { describe, expect, it, vi } from 'vitest';
import {
  XrpcCarPermissionedRepoRecoveryPort,
  type PermissionedCarFetch,
} from '../car-permissioned-repo-recovery.js';
import type { SpaceRef } from '../types.js';

const space: SpaceRef = {
  arbiterDid: 'did:plc:coop' as DID,
  expectedSpaceType: 'network.coopsource.org.spaceType.members',
  spaceKey: 'members',
};
const repoDid = 'did:plc:alice' as DID;
const credential = {
  token: 'space-token',
  expiresAt: new Date('2026-07-30T13:00:00Z'),
};

describe('XrpcCarPermissionedRepoRecoveryPort', () => {
  it('decodes the pinned two-root commit, index, and record layout', async () => {
    const record = {
      $type: 'app.example.record',
      value: 'recovered',
    };
    const recordBlock = await block(record);
    const commit = {
      ver: 1,
      hash: new Uint8Array(32).fill(1),
      mac: new Uint8Array(32).fill(2),
      ikm: new Uint8Array(32).fill(3),
      sig: new Uint8Array(64).fill(4),
      rev: '3krev',
    };
    const commitBlock = await block(commit);
    const indexBlock = await block({
      'app.example.record/one': recordBlock.cid,
    });
    const car = await encodeCar(
      [commitBlock.cid, indexBlock.cid],
      [commitBlock, indexBlock, recordBlock],
    );
    const fetcher = carFetch(car);
    const recovery = new XrpcCarPermissionedRepoRecoveryPort(fetcher);

    const recovered = await recovery.recover({
      serviceUrl: 'https://repo.example',
      space,
      repoDid,
      credential,
      cause: new Error('LtHash mismatch'),
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://repo.example/xrpc/com.atproto.space.getRepo?space=at%3A%2F%2Fdid%3Aplc%3Acoop%2Fspace%2Fnetwork.coopsource.org.spaceType.members%2Fmembers&repo=did%3Aplc%3Aalice',
      {
        method: 'GET',
        headers: {
          accept: 'application/vnd.ipld.car',
          authorization: 'Bearer space-token',
        },
      },
    );
    expect(recovered.commit).toEqual(commit);
    expect(recovered.state).toEqual({
      space,
      repoDid,
      revision: '3krev',
      records: [
        {
          collection: 'app.example.record',
          rkey: 'one',
          cid: recordBlock.cid.toString(),
          record,
          sourceRevision: '3krev',
        },
      ],
    });
  });

  it('fails closed when the CAR does not have both required roots', async () => {
    const only = await block({ value: 'one' });
    const car = await encodeCar([only.cid], [only]);
    const recovery = new XrpcCarPermissionedRepoRecoveryPort(carFetch(car));

    await expect(
      recovery.recover({
        serviceUrl: 'https://repo.example',
        space,
        repoDid,
        credential,
        cause: new Error('oplog gap'),
      }),
    ).rejects.toMatchObject({
      kind: 'verification',
      message: 'Repository CAR must have two roots, received 1',
    });
  });
});

async function block(value: unknown): Promise<{
  readonly cid: CID;
  readonly bytes: Uint8Array;
}> {
  const bytes = dagCbor.encode(value);
  const digest = await sha256.digest(bytes);
  return { cid: CID.createV1(dagCbor.code, digest), bytes };
}

async function encodeCar(
  roots: CID[],
  blocks: ReadonlyArray<{ readonly cid: CID; readonly bytes: Uint8Array }>,
): Promise<Uint8Array> {
  const { writer, out } = CarWriter.create(roots);
  const chunks: Uint8Array[] = [];
  await Promise.all([
    (async () => {
      for (const block of blocks) await writer.put(block);
      await writer.close();
    })(),
    (async () => {
      for await (const chunk of out) chunks.push(chunk);
    })(),
  ]);
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function carFetch(bytes: Uint8Array) {
  return vi.fn<PermissionedCarFetch>(async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
  }));
}
