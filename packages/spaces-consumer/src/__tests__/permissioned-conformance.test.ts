import { CarWriter } from '@ipld/car';
import * as dagCbor from '@ipld/dag-cbor';
import { sha256 } from 'multiformats/hashes/sha2';
import { CID } from 'multiformats/cid';
import { describe, expect, it, vi } from 'vitest';
import {
  PERMISSIONED_CONFORMANCE_TARGETS,
  runPermissionedConformanceProbe,
  type PermissionedConformanceFetch,
  type PermissionedConformanceFetchResponse,
} from '../permissioned-conformance.js';
import type { DID } from '@coopsource/common';

const repoDid = 'did:plc:alice' as DID;
const serviceUrl = 'https://target.example';
const spaceUri =
  'at://did:plc:coop/space/network.coopsource.org.spaceType.members/members';
const bytes = (value: number) => ({
  $bytes: Buffer.alloc(32, value).toString('base64url'),
});

describe('permissioned conformance differential', () => {
  it('reports the Proposal 0016 profile and an unimplemented CAR endpoint', async () => {
    const fetcher = queuedFetch([
      jsonResponse({
        repos: [{ did: repoDid, rev: '3khead', hash: bytes(1) }],
      }),
      jsonResponse({ ops: [], commit: proposalCommit() }),
      jsonResponse({ commit: proposalCommit() }),
      textResponse('not implemented', 501),
    ]);

    const report = await runPermissionedConformanceProbe({
      target: 'atproto-pr-5187',
      serviceUrl,
      spaceUri,
      repoDid,
      authorization: 'Bearer proposal-credential',
      fetcher,
    });

    expect(report.summary).toEqual({
      conformant: 3,
      deviation: 0,
      unsupported: 1,
      failed: 0,
      skipped: 1,
    });
    expect(report.checks[3]).toMatchObject({
      id: 'getRepo',
      outcome: 'unsupported',
      httpStatus: 501,
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `${serviceUrl}/xrpc/com.atproto.space.listRepoOps?space=${encodeURIComponent(spaceUri)}&repo=${encodeURIComponent(repoDid)}&limit=1`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer proposal-credential',
        }),
      }),
    );
  });

  it('captures HappyView oplog, commit, CAR, and registration differences', async () => {
    const car = await repoCar({
      ver: 1,
      hash: new Uint8Array(32).fill(1),
      mac: new Uint8Array(32).fill(2),
      ikm: new Uint8Array(32).fill(3),
      rev: '3khead',
    });
    const fetcher = queuedFetch([
      jsonResponse({ repos: [{ did: repoDid }] }),
      jsonResponse({ ops: [], cursor: '3khead', commit: happyViewCommit() }),
      jsonResponse({ rev: '3khead', commit: happyViewCommit() }),
      binaryResponse(car, 'application/vnd.ipld.car'),
      jsonResponse({ id: 'registration-id' }),
    ]);

    const report = await runPermissionedConformanceProbe({
      target: 'happyview-2.12.0-dev.2',
      serviceUrl,
      spaceUri,
      repoDid,
      authorization: 'DPoP test-session',
      notification: {
        endpoint: 'https://consumer.example/xrpc/com.atproto.space.notifyWrite',
        serviceDid: 'did:web:consumer.example' as DID,
      },
      fetcher,
    });

    expect(report.summary).toEqual({
      conformant: 1,
      deviation: 4,
      unsupported: 0,
      failed: 0,
      skipped: 0,
    });
    expect(report.checks[1]?.observations).toEqual([
      'commit is missing sig',
      'target pagination uses cursor instead of since',
    ]);
    expect(report.checks[3]?.observations).toEqual(['commit is missing sig']);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `${serviceUrl}/xrpc/com.atproto.space.listRepoOps?space=${encodeURIComponent(spaceUri)}&did=${encodeURIComponent(repoDid)}&limit=1`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      5,
      `${serviceUrl}/xrpc/com.atproto.space.registerNotify`,
      expect.objectContaining({
        body: JSON.stringify({
          space: spaceUri,
          serviceDid: 'did:web:consumer.example',
          endpoint:
            'https://consumer.example/xrpc/com.atproto.space.notifyWrite',
        }),
      }),
    );
  });

  it('reports malformed oplog entries and misleading CAR media types', async () => {
    const car = await repoCar(proposalCommit());
    const fetcher = queuedFetch([
      jsonResponse({ repos: [{ did: repoDid }] }),
      jsonResponse({
        ops: [
          {
            rev: '3khead',
            collection: 'network.coopsource.test.record',
            rkey: 'record-1',
            cid: 'bafyrecord',
          },
        ],
        commit: proposalCommit(),
      }),
      jsonResponse({ commit: proposalCommit() }),
      binaryResponse(car, 'application/octet-stream'),
    ]);

    const report = await runPermissionedConformanceProbe({
      target: 'atproto-pr-5187',
      serviceUrl,
      spaceUri,
      repoDid,
      authorization: 'Bearer proposal-credential',
      fetcher,
    });

    expect(report.checks[1]).toMatchObject({
      id: 'listRepoOps',
      outcome: 'deviation',
      observations: ['1 ops are missing required fields'],
    });
    expect(report.checks[3]).toMatchObject({
      id: 'getRepo',
      outcome: 'deviation',
      mediaType: 'application/octet-stream',
      observations: ['response media type is application/octet-stream'],
    });
  });

  it('does not begin the next request after cancellation of an in-flight call', async () => {
    const controller = new AbortController();
    const started: string[] = [];
    const fetcher = vi.fn<PermissionedConformanceFetch>(
      (url, init) =>
        new Promise((resolve, reject) => {
          started.push(url);
          init.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          );
          void resolve;
        }),
    );
    const running = runPermissionedConformanceProbe({
      target: 'atproto-pr-5187',
      serviceUrl,
      spaceUri,
      repoDid,
      authorization: 'Bearer proposal-credential',
      signal: controller.signal,
      fetcher,
    });

    await vi.waitFor(() => expect(started).toHaveLength(1));
    controller.abort(new Error('operator cancelled'));

    await expect(running).rejects.toThrow('operator cancelled');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps target pins and high-impact known deviations executable', () => {
    expect(
      PERMISSIONED_CONFORMANCE_TARGETS['atproto-pr-5187'].source.commit,
    ).toBe('3f6c96d5d2d25438bd40fa89d6ecc37865f8e354');
    expect(
      PERMISSIONED_CONFORMANCE_TARGETS['happyview-2.12.0-dev.2'].source,
    ).toMatchObject({
      ref: 'v2.12.0-dev.2',
      commit: 'bf4517c6121839189a2466dd48ec4639364f3b63',
    });
    expect(
      PERMISSIONED_CONFORMANCE_TARGETS[
        'happyview-2.12.0-dev.2'
      ].knownDeviations.filter((item) => item.impact === 'blocking'),
    ).toHaveLength(3);
  });
});

function proposalCommit(): Record<string, unknown> {
  return {
    ver: 1,
    hash: bytes(1),
    mac: bytes(2),
    ikm: bytes(3),
    sig: bytes(4),
    rev: '3khead',
  };
}

function happyViewCommit(): Record<string, unknown> {
  const { sig: _sig, ...commit } = proposalCommit();
  return commit;
}

function queuedFetch(
  responses: ReadonlyArray<PermissionedConformanceFetchResponse>,
) {
  let index = 0;
  return vi.fn<PermissionedConformanceFetch>(async () => {
    const response = responses[index++];
    if (!response) throw new Error(`unexpected request ${index}`);
    await Promise.resolve();
    return response;
  });
}

function jsonResponse(
  body: unknown,
  status = 200,
): PermissionedConformanceFetchResponse {
  return textResponse(JSON.stringify(body), status, 'application/json');
}

function textResponse(
  body: string,
  status: number,
  mediaType = 'text/plain',
): PermissionedConformanceFetchResponse {
  const encoded = new TextEncoder().encode(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => mediaType },
    text: async () => body,
    arrayBuffer: async () => encoded.buffer,
  };
}

function binaryResponse(
  body: Uint8Array,
  mediaType: string,
): PermissionedConformanceFetchResponse {
  return {
    ok: true,
    status: 200,
    headers: { get: () => mediaType },
    text: async () => new TextDecoder().decode(body),
    arrayBuffer: async () =>
      body.buffer.slice(
        body.byteOffset,
        body.byteOffset + body.byteLength,
      ) as ArrayBuffer,
  };
}

async function repoCar(commit: Record<string, unknown>): Promise<Uint8Array> {
  const commitBytes = dagCbor.encode(commit);
  const commitCid = CID.createV1(
    dagCbor.code,
    await sha256.digest(commitBytes),
  );
  const indexBytes = dagCbor.encode({});
  const indexCid = CID.createV1(dagCbor.code, await sha256.digest(indexBytes));
  const { writer, out } = CarWriter.create([commitCid, indexCid]);
  const chunks: Uint8Array[] = [];
  const collecting = (async () => {
    for await (const chunk of out) chunks.push(chunk);
  })();
  await writer.put({ cid: commitCid, bytes: commitBytes });
  await writer.put({ cid: indexCid, bytes: indexBytes });
  await writer.close();
  await collecting;
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const car = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    car.set(chunk, offset);
    offset += chunk.length;
  }
  return car;
}
