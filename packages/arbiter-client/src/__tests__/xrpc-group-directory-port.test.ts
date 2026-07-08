import { describe, expect, it } from 'vitest';
import type { DID } from '@coopsource/common';
import type { MembershipCursor } from '@coopsource/spaces-consumer';
import {
  formatProtocolSpaceUri,
  membersSpace,
  parseProtocolSpaceUri,
  roleSpace,
  XrpcGroupDirectoryPort,
  type XrpcFetch,
  type XrpcFetchInit,
  type XrpcFetchResponse,
} from '../index.js';

const cooperativeDid = 'did:plc:coop' as DID;
const aliceDid = 'did:plc:alice' as DID;
const bobDid = 'did:plc:bob' as DID;

describe('XrpcGroupDirectoryPort', () => {
  it('maps SpaceRef to the current proposal space URI shape', () => {
    const space = roleSpace(cooperativeDid, 'admin');
    const uri = formatProtocolSpaceUri(space);

    expect(uri).toBe(
      'at://did:plc:coop/space/network.coopsource.org.spaceType.role/roles%2Fadmin',
    );
    expect(parseProtocolSpaceUri(uri!)).toEqual(space);
    expect(
      parseProtocolSpaceUri('at://did:plc:coop/app.bsky.feed.post/abc'),
    ).toBeNull();
  });

  it('lists spaces through com.atproto.space.listSpaces', async () => {
    const fetch = new QueuedFetch([
      jsonResponse({
        cursor: 'next',
        spaces: [
          {
            uri: formatProtocolSpaceUri(membersSpace(cooperativeDid)),
            isOwner: true,
          },
          { uri: 'not-a-space-uri', isOwner: true },
        ],
      }),
    ]);
    const port = new XrpcGroupDirectoryPort({
      serviceUrl: 'https://pds.example',
      fetch: fetch.fetch,
      headers: async () => ({ authorization: 'Bearer token' }),
    });

    const page = await port.listSpaces({
      arbiterDid: cooperativeDid,
      cursor: 'cursor-1' as MembershipCursor,
      consistency: 'projection-ok',
    });

    expect(page.spaces).toEqual([membersSpace(cooperativeDid)]);
    expect(page.cursor).toBe('next');
    expect(page.stale).toBe(true);
    const request = fetch.requests[0]!;
    expect(requestPath(request.url)).toBe('/xrpc/com.atproto.space.listSpaces');
    expect(searchParam(request.url, 'did')).toBe(cooperativeDid);
    expect(searchParam(request.url, 'cursor')).toBe('cursor-1');
    expect(request.init.headers).toMatchObject({
      accept: 'application/json',
      authorization: 'Bearer token',
    });
  });

  it('loads space config through com.atproto.space.getSpace', async () => {
    const space = membersSpace(cooperativeDid);
    const config = {
      $type: 'com.atproto.simplespace.defs#spaceConfig',
      policy: 'member-list',
      appAccess: { $type: 'com.atproto.simplespace.defs#open' },
    };
    const fetch = new QueuedFetch([
      jsonResponse(
        {
          uri: formatProtocolSpaceUri(space),
          config,
        },
        { headers: { etag: 'rev-1' } },
      ),
    ]);
    const port = new XrpcGroupDirectoryPort({
      serviceUrl: 'https://pds.example',
      fetch: fetch.fetch,
    });

    const result = await port.getSpaceConfig({
      ...space,
      consistency: 'strict',
    });

    expect(result).toMatchObject({
      ok: true,
      space,
      config,
      stale: false,
      sourceRevision: 'rev-1',
    });
    expect(requestPath(fetch.requests[0]!.url)).toBe(
      '/xrpc/com.atproto.space.getSpace',
    );
    expect(searchParam(fetch.requests[0]!.url, 'space')).toBe(
      formatProtocolSpaceUri(space),
    );
  });

  it('paginates simplespace members for strict resolution', async () => {
    const space = membersSpace(cooperativeDid);
    const fetch = new QueuedFetch([
      jsonResponse({
        cursor: aliceDid,
        members: [{ did: aliceDid }],
      }),
      jsonResponse({
        members: [{ did: bobDid }],
      }),
    ]);
    const port = new XrpcGroupDirectoryPort({
      serviceUrl: 'https://pds.example',
      fetch: fetch.fetch,
      pageSize: 1,
    });

    const resolved = await port.resolveSpaceMembers({
      ...space,
      consistency: 'strict',
    });

    expect(resolved.ok).toBe(true);
    expect(resolved.partial).toBe(false);
    expect(resolved.stale).toBe(false);
    expect(resolved.members.map((member) => member.did)).toEqual([
      aliceDid,
      bobDid,
    ]);
    expect(resolved.directMembers.map((member) => member.member)).toEqual([
      { kind: 'did', did: aliceDid },
      { kind: 'did', did: bobDid },
    ]);
    expect(fetch.requests.map((request) => requestPath(request.url))).toEqual([
      '/xrpc/com.atproto.simplespace.listMembers',
      '/xrpc/com.atproto.simplespace.listMembers',
    ]);
    expect(searchParam(fetch.requests[1]!.url, 'cursor')).toBe(aliceDid);
  });

  it('marks projection-ok resolution partial when the member list has another page', async () => {
    const fetch = new QueuedFetch([
      jsonResponse({
        cursor: aliceDid,
        members: [{ did: aliceDid }],
      }),
    ]);
    const port = new XrpcGroupDirectoryPort({
      serviceUrl: 'https://pds.example',
      fetch: fetch.fetch,
      pageSize: 1,
    });

    const resolved = await port.resolveSpaceMembers({
      ...membersSpace(cooperativeDid),
      consistency: 'projection-ok',
    });

    expect(resolved.ok).toBe(true);
    expect(resolved.partial).toBe(true);
    expect(resolved.members.map((member) => member.did)).toEqual([aliceDid]);
    expect(fetch.requests).toHaveLength(1);
  });

  it('fails closed when the upstream member endpoint is unavailable', async () => {
    const fetch = new QueuedFetch([
      jsonResponse(
        {
          error: 'UpstreamTimeout',
          message: 'not today',
        },
        { status: 503 },
      ),
    ]);
    const port = new XrpcGroupDirectoryPort({
      serviceUrl: 'https://pds.example',
      fetch: fetch.fetch,
    });

    const resolved = await port.resolveSpaceMembers({
      ...membersSpace(cooperativeDid),
      consistency: 'strict',
    });

    expect(resolved).toMatchObject({
      ok: false,
      members: [],
      partial: true,
      stale: true,
      missingSpaces: [
        {
          space: membersSpace(cooperativeDid),
          reason: 'unavailable',
        },
      ],
    });
  });
});

class QueuedFetch {
  readonly requests: Array<{
    readonly url: string;
    readonly init: XrpcFetchInit;
  }> = [];

  constructor(private readonly responses: XrpcFetchResponse[]) {}

  readonly fetch: XrpcFetch = async (url, init) => {
    this.requests.push({ url, init });
    const response = this.responses.shift();
    if (!response) {
      throw new Error(`Unexpected request: ${url}`);
    }
    await Promise.resolve();
    return response;
  };
}

function jsonResponse(
  body: unknown,
  options: {
    readonly status?: number;
    readonly headers?: Record<string, string>;
  } = {},
): XrpcFetchResponse {
  const status = options.status ?? 200;
  const headers = normalizeHeaders(options.headers ?? {});
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
    async json() {
      await Promise.resolve();
      return body;
    },
  };
}

function normalizeHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

function requestPath(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] ?? '';
}

function searchParam(url: string, key: string): string | null {
  const query = url.split('?')[1] ?? '';
  for (const part of query.split('&')) {
    if (!part) continue;
    const [rawKey, rawValue = ''] = part.split('=');
    if (decodeURIComponent(rawKey) === key) {
      return decodeURIComponent(rawValue);
    }
  }
  return null;
}
