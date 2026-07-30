import { describe, expect, it, vi } from 'vitest';
import type { DID } from '@coopsource/common';
import {
  XrpcPermissionedSyncClient,
  type XrpcPermissionedSyncFetch,
} from '../xrpc-permissioned-repo-port.js';
import type { SpaceRef } from '../types.js';

const space: SpaceRef = {
  arbiterDid: 'did:plc:coop' as DID,
  expectedSpaceType: 'network.coopsource.org.spaceType.members',
  spaceKey: 'members',
};
const credential = {
  token: 'space-token',
  expiresAt: new Date('2026-07-30T13:00:00Z'),
};

describe('XrpcPermissionedSyncClient', () => {
  it('calls listRepos with the pinned query and space credential', async () => {
    const fetcher = jsonFetch({
      repos: [
        {
          did: 'did:plc:alice',
          rev: '3krev',
          hash: { $bytes: Buffer.alloc(32, 7).toString('base64url') },
        },
      ],
    });
    const client = new XrpcPermissionedSyncClient(fetcher);

    const page = await client.listRepos({
      serviceUrl: 'https://space.example',
      space,
      credential,
      limit: 100,
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://space.example/xrpc/com.atproto.space.listRepos?space=at%3A%2F%2Fdid%3Aplc%3Acoop%2Fspace%2Fnetwork.coopsource.org.spaceType.members%2Fmembers&limit=100',
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: 'Bearer space-token',
        },
      },
    );
    expect(page.repos[0]).toMatchObject({
      did: 'did:plc:alice',
      rev: '3krev',
      hash: new Uint8Array(32).fill(7),
    });
  });

  it('parses nullable oplog CIDs and the pinned signed commit fields', async () => {
    const bytes = (length: number, value: number) => ({
      $bytes: Buffer.alloc(length, value).toString('base64url'),
    });
    const fetcher = jsonFetch({
      ops: [
        {
          rev: '3krev',
          collection: 'app.example.record',
          rkey: 'one',
          cid: null,
          prev: 'bafy-old',
        },
      ],
      commit: {
        ver: 1,
        hash: bytes(32, 1),
        mac: bytes(32, 2),
        ikm: bytes(32, 3),
        sig: bytes(64, 4),
        rev: '3krev',
      },
    });
    const client = new XrpcPermissionedSyncClient(fetcher);

    const page = await client.listRepoOps({
      serviceUrl: 'https://repo.example',
      space,
      repoDid: 'did:plc:alice' as DID,
      credential,
      since: '3kold',
      limit: 100,
    });

    expect(page.ops).toEqual([
      {
        rev: '3krev',
        collection: 'app.example.record',
        rkey: 'one',
        cid: null,
        prev: 'bafy-old',
      },
    ]);
    expect(page.commit).toMatchObject({
      ver: 1,
      rev: '3krev',
      hash: new Uint8Array(32).fill(1),
      mac: new Uint8Array(32).fill(2),
      ikm: new Uint8Array(32).fill(3),
      sig: new Uint8Array(64).fill(4),
    });
  });

  it('registers the notification endpoint with a POST body', async () => {
    const fetcher = jsonFetch({
      expiresAt: '2026-07-31T12:00:00.000Z',
    });
    const client = new XrpcPermissionedSyncClient(fetcher);

    await expect(
      client.registerNotify({
        serviceUrl: 'https://space.example',
        space,
        credential,
        endpoint: 'https://app.example/xrpc/com.atproto.space.notifyWrite',
      }),
    ).resolves.toEqual({
      expiresAt: new Date('2026-07-31T12:00:00.000Z'),
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://space.example/xrpc/com.atproto.space.registerNotify',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          space:
            'at://did:plc:coop/space/network.coopsource.org.spaceType.members/members',
          endpoint: 'https://app.example/xrpc/com.atproto.space.notifyWrite',
        }),
      }),
    );
  });

  it('classifies expired credentials as authentication failures', async () => {
    const fetcher = vi.fn<XrpcPermissionedSyncFetch>(async () => ({
      ok: false,
      status: 401,
      json: async () => ({
        error: 'AuthenticationRequired',
        message: 'expired',
      }),
    }));
    const client = new XrpcPermissionedSyncClient(fetcher);

    await expect(
      client.listRepos({
        serviceUrl: 'https://space.example',
        space,
        credential,
        limit: 100,
      }),
    ).rejects.toMatchObject({ kind: 'auth', message: 'expired' });
  });
});

function jsonFetch(body: unknown) {
  return vi.fn<XrpcPermissionedSyncFetch>(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  }));
}
