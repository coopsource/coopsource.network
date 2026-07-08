import { Buffer } from 'node:buffer';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatPermissionedSpaceLocationUri,
  XrpcPermissionedRecordWritePort,
  type XrpcPermissionedRecordWriteFetch,
} from '../index.js';
import { formatSpaceRecordUri } from '../space-uri.js';
import type { SpaceRef } from '../types.js';
import { fakeCid, fakeDid } from './helpers/factories.js';

const aliceDid = fakeDid('did:plc:alice');
const membersSpace: SpaceRef = {
  arbiterDid: fakeDid('did:plc:coop'),
  spaceKey: 'members',
  expectedSpaceType: 'network.coopsource.org.spaceType.members',
};
const roleSpace: SpaceRef = {
  arbiterDid: fakeDid('did:plc:coop'),
  spaceKey: 'roles/board',
  expectedSpaceType: 'network.coopsource.org.spaceType.role',
};
const voteCollection = 'network.coopsource.governance.vote';

describe('XrpcPermissionedRecordWritePort', () => {
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

  it('formats the space URI used by draft com.atproto.space write methods', () => {
    expect(formatPermissionedSpaceLocationUri(roleSpace)).toBe(
      'at://did:plc:coop/space/network.coopsource.org.spaceType.role/roles%2Fboard',
    );
  });

  it('creates a permissioned record through com.atproto.space.createRecord', async () => {
    const events: string[] = [];
    const server = await startServer([
      async () => {
        events.push('server-request');
        await delay(1);
        return {
          headers: { etag: 'rev-42' },
          body: {
            uri: formatSpaceRecordUri({
              spaceDid: roleSpace.arbiterDid,
              spaceType: roleSpace.expectedSpaceType!,
              skey: roleSpace.spaceKey,
              authorDid: aliceDid,
              collection: voteCollection,
              rkey: 'vote1',
            }),
            cid: fakeCid('bafyvote'),
            validationStatus: 'valid',
          },
        };
      },
    ]);
    const port = new XrpcPermissionedRecordWritePort({
      validate: true,
      sessionProvider: async (request) => {
        events.push('session-start');
        await Promise.resolve();
        expect(request.operation).toBe('createRecord');
        events.push('session-finish');
        return {
          serviceUrl: server.url,
          accessToken: 'oauth-token',
          headers: async (request) => {
            events.push(`headers:${request.nsid}`);
            await Promise.resolve();
            expect(request.url).toBe(
              `${server.url}/xrpc/com.atproto.space.createRecord`,
            );
            return { dpop: 'proof' };
          },
        };
      },
    });

    const result = await port.createRecord({
      space: roleSpace,
      authorDid: aliceDid,
      collection: voteCollection,
      record: { choice: 'yes' },
      rkey: 'vote1',
    });

    expect(result).toEqual({
      location: {
        space: roleSpace,
        authorDid: aliceDid,
        collection: voteCollection,
        rkey: 'vote1',
      },
      cid: fakeCid('bafyvote'),
      sourceRevision: 'rev-42',
    });
    expect(events).toEqual([
      'session-start',
      'session-finish',
      'headers:com.atproto.space.createRecord',
      'server-request',
    ]);
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      path: '/xrpc/com.atproto.space.createRecord',
      body: {
        space:
          'at://did:plc:coop/space/network.coopsource.org.spaceType.role/roles%2Fboard',
        repo: aliceDid,
        collection: voteCollection,
        rkey: 'vote1',
        validate: true,
        record: { $type: voteCollection, choice: 'yes' },
      },
    });
    expect(server.requests[0]?.headers.authorization).toBe(
      'Bearer oauth-token',
    );
    expect(server.requests[0]?.headers.dpop).toBe('proof');
  });

  it('deletes a permissioned record through com.atproto.space.deleteRecord', async () => {
    const server = await startServer([
      async () => ({
        body: {},
      }),
    ]);
    const port = new XrpcPermissionedRecordWritePort({
      sessionProvider: (request) => {
        expect(request.operation).toBe('deleteRecord');
        return {
          serviceUrl: server.url,
          accessToken: 'oauth-token',
        };
      },
    });

    await port.deleteRecord({
      space: membersSpace,
      authorDid: aliceDid,
      collection: voteCollection,
      rkey: 'vote1',
    });

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      path: '/xrpc/com.atproto.space.deleteRecord',
      body: {
        space:
          'at://did:plc:coop/space/network.coopsource.org.spaceType.members/members',
        repo: aliceDid,
        collection: voteCollection,
        rkey: 'vote1',
      },
    });
  });

  it('updates a permissioned record through com.atproto.space.putRecord', async () => {
    const server = await startServer([
      async () => ({
        body: {
          uri: formatSpaceRecordUri({
            spaceDid: membersSpace.arbiterDid,
            spaceType: membersSpace.expectedSpaceType!,
            skey: membersSpace.spaceKey,
            authorDid: aliceDid,
            collection: voteCollection,
            rkey: 'vote1',
          }),
          cid: fakeCid('bafyvote2'),
        },
      }),
    ]);
    const port = new XrpcPermissionedRecordWritePort({
      validate: false,
      sessionProvider: (request) => {
        expect(request.operation).toBe('putRecord');
        return {
          serviceUrl: server.url,
          accessToken: 'oauth-token',
        };
      },
    });

    const result = await port.updateRecord({
      space: membersSpace,
      authorDid: aliceDid,
      collection: voteCollection,
      rkey: 'vote1',
      record: { choice: 'no' },
    });

    expect(result).toEqual({
      location: {
        space: membersSpace,
        authorDid: aliceDid,
        collection: voteCollection,
        rkey: 'vote1',
      },
      cid: fakeCid('bafyvote2'),
    });
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]).toMatchObject({
      method: 'POST',
      path: '/xrpc/com.atproto.space.putRecord',
      body: {
        space:
          'at://did:plc:coop/space/network.coopsource.org.spaceType.members/members',
        repo: aliceDid,
        collection: voteCollection,
        rkey: 'vote1',
        validate: false,
        record: { $type: voteCollection, choice: 'no' },
      },
    });
    expect(server.requests[0]?.headers.authorization).toBe(
      'Bearer oauth-token',
    );
  });

  it('requires an author session with an authorization header', async () => {
    const fetch: XrpcPermissionedRecordWriteFetch = async () => {
      throw new Error('fetch should not be called without auth');
    };
    const port = new XrpcPermissionedRecordWritePort({
      fetch,
      sessionProvider: () => ({
        serviceUrl: 'https://pds.example',
      }),
    });

    await expect(
      port.createRecord({
        space: membersSpace,
        authorDid: aliceDid,
        collection: voteCollection,
        record: { choice: 'yes' },
      }),
    ).rejects.toMatchObject({
      name: 'PermissionedRecordWriteError',
      kind: 'auth',
    });
  });

  it('rejects records whose explicit $type does not match the collection', async () => {
    let sessionCalled = false;
    const fetch: XrpcPermissionedRecordWriteFetch = async () => {
      throw new Error('fetch should not be called for an invalid record');
    };
    const port = new XrpcPermissionedRecordWritePort({
      fetch,
      sessionProvider: () => {
        sessionCalled = true;
        return {
          serviceUrl: 'https://pds.example',
          accessToken: 'oauth-token',
        };
      },
    });

    await expect(
      port.createRecord({
        space: membersSpace,
        authorDid: aliceDid,
        collection: voteCollection,
        record: { $type: 'network.coopsource.wrong.type', choice: 'yes' },
      }),
    ).rejects.toMatchObject({
      name: 'PermissionedRecordWriteError',
      kind: 'protocol',
    });
    expect(sessionCalled).toBe(false);
  });

  it('does not let an undefined $type erase the collection type', async () => {
    const server = await startServer([
      async () => ({
        body: {
          uri: formatSpaceRecordUri({
            spaceDid: membersSpace.arbiterDid,
            spaceType: membersSpace.expectedSpaceType!,
            skey: membersSpace.spaceKey,
            authorDid: aliceDid,
            collection: voteCollection,
            rkey: 'vote1',
          }),
          cid: fakeCid('bafyvote'),
        },
      }),
    ]);
    const port = new XrpcPermissionedRecordWritePort({
      sessionProvider: () => ({
        serviceUrl: server.url,
        accessToken: 'oauth-token',
      }),
    });

    await port.createRecord({
      space: membersSpace,
      authorDid: aliceDid,
      collection: voteCollection,
      record: { $type: undefined, choice: 'yes' },
      rkey: 'vote1',
    });

    expect(server.requests[0]?.body).toMatchObject({
      record: { $type: voteCollection, choice: 'yes' },
    });
  });

  it('allows session-bound authenticated fetch to inject OAuth headers', async () => {
    const server = await startServer([
      async () => ({
        body: {
          uri: formatSpaceRecordUri({
            spaceDid: membersSpace.arbiterDid,
            spaceType: membersSpace.expectedSpaceType!,
            skey: membersSpace.spaceKey,
            authorDid: aliceDid,
            collection: voteCollection,
            rkey: 'vote1',
          }),
          cid: fakeCid('bafyvote'),
        },
      }),
    ]);
    const port = new XrpcPermissionedRecordWritePort({
      sessionProvider: () => ({
        serviceUrl: server.url,
        authenticatedFetch: async (url, init) =>
          fetch(url, {
            ...init,
            headers: {
              ...init.headers,
              authorization: 'DPoP oauth-token',
              dpop: 'proof',
            },
          }),
      }),
    });

    await port.createRecord({
      space: membersSpace,
      authorDid: aliceDid,
      collection: voteCollection,
      record: { choice: 'yes' },
      rkey: 'vote1',
    });

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.headers.authorization).toBe('DPoP oauth-token');
    expect(server.requests[0]?.headers.dpop).toBe('proof');
  });

  it('maps draft protocol errors to specific write errors', async () => {
    const cases = [
      {
        response: { status: 404, body: { error: 'SpaceNotFound' } },
        kind: 'invalid-space',
      },
      {
        response: { status: 403, body: { error: 'NotAMember' } },
        kind: 'not-member',
      },
      {
        response: { status: 409, body: { error: 'RecordAlreadyExists' } },
        kind: 'conflict',
      },
      {
        response: { status: 503, body: { error: 'UpstreamTimeout' } },
        kind: 'unavailable',
      },
    ] as const;

    for (const testCase of cases) {
      const server = await startServer([async () => testCase.response]);
      const port = new XrpcPermissionedRecordWritePort({
        sessionProvider: () => ({
          serviceUrl: server.url,
          accessToken: 'oauth-token',
        }),
      });

      await expect(
        port.createRecord({
          space: membersSpace,
          authorDid: aliceDid,
          collection: voteCollection,
          record: { choice: 'yes' },
        }),
      ).rejects.toMatchObject({
        name: 'PermissionedRecordWriteError',
        kind: testCase.kind,
      });
    }
  });

  it('rejects a successful create response whose URI points at another location', async () => {
    const server = await startServer([
      async () => ({
        body: {
          uri: formatSpaceRecordUri({
            spaceDid: membersSpace.arbiterDid,
            spaceType: membersSpace.expectedSpaceType!,
            skey: membersSpace.spaceKey,
            authorDid: fakeDid('did:plc:mallory'),
            collection: voteCollection,
            rkey: 'vote1',
          }),
          cid: fakeCid('bafyvote'),
        },
      }),
    ]);
    const port = new XrpcPermissionedRecordWritePort({
      sessionProvider: () => ({
        serviceUrl: server.url,
        accessToken: 'oauth-token',
      }),
    });

    await expect(
      port.createRecord({
        space: membersSpace,
        authorDid: aliceDid,
        collection: voteCollection,
        record: { choice: 'yes' },
        rkey: 'vote1',
      }),
    ).rejects.toMatchObject({
      name: 'PermissionedRecordWriteError',
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

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
