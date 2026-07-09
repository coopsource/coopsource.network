import { Buffer } from 'node:buffer';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatProtocolSpaceUri,
  membersSpace,
  roleSpace,
  XrpcSimpleSpaceManagementClient,
  type XrpcSimpleSpaceManagementFetch,
} from '../index.js';
import type { DID } from '@coopsource/common';

const cooperativeDid = 'did:plc:coop' as DID;
const aliceDid = 'did:plc:alice' as DID;
const boardSpace = roleSpace(cooperativeDid, 'board');

describe('XrpcSimpleSpaceManagementClient', () => {
  const servers: XrpcTestServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  async function startServer(
    handlers: ReadonlyArray<XrpcRequestHandler>,
  ): Promise<XrpcTestServer> {
    const server = await XrpcTestServer.start(handlers);
    servers.push(server);
    return server;
  }

  it('creates a simplespace with CSN space key semantics', async () => {
    const events: string[] = [];
    const server = await startServer([
      async () => {
        events.push('server-request');
        await Promise.resolve();
        return {
          headers: { etag: 'space-rev-1' },
          body: {
            uri: formatProtocolSpaceUri(boardSpace),
          },
        };
      },
    ]);
    const client = new XrpcSimpleSpaceManagementClient({
      serviceUrl: `${server.url}/`,
      headers: async (request) => {
        events.push(`headers:${request.nsid}`);
        await Promise.resolve();
        expect(request.url).toBe(
          `${server.url}/xrpc/com.atproto.simplespace.createSpace`,
        );
        return { authorization: 'Bearer owner-oauth' };
      },
    });

    await expect(
      client.createSpace({
        space: boardSpace,
        config: {
          $type: 'com.atproto.simplespace.defs#spaceConfig',
          policy: 'member-list',
          appAccess: { $type: 'com.atproto.simplespace.defs#open' },
        },
      }),
    ).resolves.toEqual({
      space: boardSpace,
      uri: 'at://did:plc:coop/space/network.coopsource.org.spaceType.role/roles%2Fboard',
      sourceRevision: 'space-rev-1',
    });

    expect(events).toEqual([
      'headers:com.atproto.simplespace.createSpace',
      'server-request',
    ]);
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      path: '/xrpc/com.atproto.simplespace.createSpace',
      body: {
        did: cooperativeDid,
        type: 'network.coopsource.org.spaceType.role',
        skey: 'roles/board',
        config: {
          $type: 'com.atproto.simplespace.defs#spaceConfig',
          policy: 'member-list',
          appAccess: { $type: 'com.atproto.simplespace.defs#open' },
        },
      },
    });
    expect(server.requests[0]?.headers.authorization).toBe(
      'Bearer owner-oauth',
    );
  });

  it('adds and removes a member through simplespace management procedures', async () => {
    const server = await startServer([
      async () => ({ body: {} }),
      async () => ({ body: {} }),
    ]);
    const client = new XrpcSimpleSpaceManagementClient({
      serviceUrl: server.url,
      headers: { authorization: 'Bearer owner-oauth' },
    });

    await client.addMember({
      space: membersSpace(cooperativeDid),
      memberDid: aliceDid,
    });
    await client.removeMember({
      space: membersSpace(cooperativeDid),
      memberDid: aliceDid,
    });

    expect(server.requests.map((request) => request.path)).toEqual([
      '/xrpc/com.atproto.simplespace.addMember',
      '/xrpc/com.atproto.simplespace.removeMember',
    ]);
    expect(server.requests[0]?.body).toEqual({
      space:
        'at://did:plc:coop/space/network.coopsource.org.spaceType.members/members',
      did: aliceDid,
    });
    expect(server.requests[1]?.body).toEqual({
      space:
        'at://did:plc:coop/space/network.coopsource.org.spaceType.members/members',
      did: aliceDid,
    });
  });

  it('requires an OAuth authorization header', async () => {
    const fetch: XrpcSimpleSpaceManagementFetch = async () => {
      throw new Error('fetch should not be called without auth');
    };
    const client = new XrpcSimpleSpaceManagementClient({
      serviceUrl: 'https://pds.example',
      fetch,
      headers: {},
    });

    await expect(
      client.addMember({
        space: membersSpace(cooperativeDid),
        memberDid: aliceDid,
      }),
    ).rejects.toMatchObject({
      name: 'XrpcSimpleSpaceManagementError',
      kind: 'auth',
    });
  });

  it('allows session-bound authenticated fetch to inject OAuth headers', async () => {
    const server = await startServer([async () => ({ body: {} })]);
    const client = new XrpcSimpleSpaceManagementClient({
      serviceUrl: server.url,
      authenticatedFetch: async (url, init) =>
        fetch(url, {
          ...init,
          headers: {
            ...init.headers,
            authorization: 'DPoP owner-oauth',
            dpop: 'proof',
          },
        }),
    });

    await client.addMember({
      space: membersSpace(cooperativeDid),
      memberDid: aliceDid,
    });

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.headers.authorization).toBe('DPoP owner-oauth');
    expect(server.requests[0]?.headers.dpop).toBe('proof');
  });

  it('maps draft management errors to specific failure kinds', async () => {
    const cases = [
      {
        response: { status: 409, body: { error: 'SpaceAlreadyExists' } },
        kind: 'conflict',
      },
      {
        response: { status: 400, body: { error: 'InvalidType' } },
        kind: 'invalid-space',
      },
      {
        response: { status: 403, body: { error: 'NotSpaceOwner' } },
        kind: 'not-owner',
      },
      {
        response: { status: 503, body: { error: 'UpstreamTimeout' } },
        kind: 'unavailable',
      },
    ] as const;

    for (const testCase of cases) {
      const server = await startServer([async () => testCase.response]);
      const client = new XrpcSimpleSpaceManagementClient({
        serviceUrl: server.url,
        headers: { authorization: 'Bearer owner-oauth' },
      });

      await expect(
        client.createSpace({ space: membersSpace(cooperativeDid) }),
      ).rejects.toMatchObject({
        name: 'XrpcSimpleSpaceManagementError',
        kind: testCase.kind,
      });
    }
  });

  it('rejects a successful create response for a different space', async () => {
    const server = await startServer([
      async () => ({
        body: {
          uri: formatProtocolSpaceUri(roleSpace(cooperativeDid, 'treasurer')),
        },
      }),
    ]);
    const client = new XrpcSimpleSpaceManagementClient({
      serviceUrl: server.url,
      headers: { authorization: 'Bearer owner-oauth' },
    });

    await expect(
      client.createSpace({ space: boardSpace }),
    ).rejects.toMatchObject({
      name: 'XrpcSimpleSpaceManagementError',
      kind: 'protocol',
    });
  });
});

type XrpcRequestHandler = (
  request: RecordedXrpcRequest,
) => XrpcTestResponse | Promise<XrpcTestResponse>;

interface XrpcTestResponse {
  readonly status?: number;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
}

interface RecordedXrpcRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: unknown;
}

class XrpcTestServer {
  private constructor(
    private readonly server: Server,
    readonly requests: RecordedXrpcRequest[],
    readonly url: string,
  ) {}

  static async start(
    handlers: ReadonlyArray<XrpcRequestHandler>,
  ): Promise<XrpcTestServer> {
    const requests: RecordedXrpcRequest[] = [];
    const queuedHandlers = [...handlers];
    const server = createServer(async (req, res) => {
      const request = await readRequest(req);
      requests.push(request);
      const handler = queuedHandlers.shift();
      if (!handler) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'UnexpectedRequest' }));
        return;
      }

      const response = await handler(request);
      res.statusCode = response.status ?? 200;
      res.setHeader('content-type', 'application/json');
      for (const [name, value] of Object.entries(response.headers ?? {})) {
        res.setHeader(name, value);
      }
      res.end(JSON.stringify(response.body ?? {}));
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address() as AddressInfo;
    return new XrpcTestServer(
      server,
      requests,
      `http://127.0.0.1:${address.port}`,
    );
  }

  async close(): Promise<void> {
    if (!this.server.listening) return;
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

async function readRequest(req: IncomingMessage): Promise<RecordedXrpcRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const rawBody = Buffer.concat(chunks).toString('utf8');
  return {
    method: req.method ?? '',
    path: new URL(req.url ?? '/', 'http://localhost').pathname,
    headers: req.headers,
    body: rawBody ? JSON.parse(rawBody) : null,
  };
}
