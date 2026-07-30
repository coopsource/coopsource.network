import type { DID } from '@coopsource/common';
import {
  SIMPLESPACE_XRPC_METHODS,
  SPACE_XRPC_METHODS,
} from '@coopsource/lexicons';
import type {
  DirectSpaceMember,
  GroupDirectoryPort,
  MembershipConsistency,
  MembershipCursor,
  ResolvedMembers,
  ResolvedSpaceMember,
  SpaceConfigResult,
  SpaceListPage,
  SpaceRef,
  UnknownLexiconObject,
} from '@coopsource/spaces-consumer';

const SPACE_MARKER = 'space';
const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_MAX_PAGES = 100;

type JsonPrimitive = string | number | boolean | null;
type JsonObject = { readonly [key: string]: JsonValue };
type JsonValue = JsonPrimitive | JsonObject | ReadonlyArray<JsonValue>;

export interface XrpcFetchInit {
  readonly method: 'GET';
  readonly headers: Record<string, string>;
}

export interface XrpcFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers?: {
    get(name: string): string | null;
  };
  json(): Promise<unknown>;
  text?(): Promise<string>;
}

export type XrpcFetch = (
  url: string,
  init: XrpcFetchInit,
) => Promise<XrpcFetchResponse>;

export type XrpcHeaderProvider =
  | Record<string, string>
  | (() => Record<string, string> | Promise<Record<string, string>>);

export interface XrpcGroupDirectoryPortOptions {
  readonly serviceUrl: string;
  readonly fetch?: XrpcFetch;
  readonly headers?: XrpcHeaderProvider;
  readonly pageSize?: number;
  readonly maxPages?: number;
}

interface XrpcSuccess {
  readonly ok: true;
  readonly body: unknown;
  readonly sourceRevision?: string;
}

interface XrpcFailure {
  readonly ok: false;
  readonly reason: 'not-found' | 'unavailable' | 'invalid-space';
  readonly stale: boolean;
}

type XrpcResult = XrpcSuccess | XrpcFailure;

interface LoadDirectMembersSuccess {
  readonly ok: true;
  readonly directMembers: ReadonlyArray<DirectSpaceMember>;
  readonly partial: boolean;
  readonly stale: false;
  readonly sourceRevision?: string;
}

interface LoadDirectMembersFailure {
  readonly ok: false;
  readonly directMembers: ReadonlyArray<DirectSpaceMember>;
  readonly partial: true;
  readonly stale: boolean;
  readonly reason: 'not-found' | 'unavailable' | 'invalid-space';
}

type LoadDirectMembersResult =
  | LoadDirectMembersSuccess
  | LoadDirectMembersFailure;

/**
 * Experimental GroupDirectoryPort adapter for the current Proposal 0016 draft
 * branch. It targets `com.atproto.space.getSpace/listSpaces` plus the baseline
 * `com.atproto.simplespace.listMembers` management endpoint.
 *
 * This is intentionally not wired as the default runtime adapter: the upstream
 * implementation remains draft, and the current protocol branch exposes direct
 * simplespace membership, not CSN's higher-level recursive group-directory
 * semantics.
 */
export class XrpcGroupDirectoryPort implements GroupDirectoryPort {
  private readonly serviceUrl: string;
  private readonly fetcher: XrpcFetch;

  constructor(private readonly options: XrpcGroupDirectoryPortOptions) {
    this.serviceUrl = options.serviceUrl.replace(/\/+$/, '');
    this.fetcher = options.fetch ?? defaultFetch();
  }

  async listSpaces(args: {
    readonly arbiterDid: DID;
    readonly cursor?: MembershipCursor;
    readonly consistency: MembershipConsistency;
  }): Promise<SpaceListPage> {
    const result = await this.getJson(SPACE_XRPC_METHODS.listSpaces, {
      did: args.arbiterDid,
      cursor: args.cursor,
      limit: this.pageSize(),
    });
    if (!result.ok) {
      return { spaces: [], stale: true };
    }

    const body = asObject(result.body);
    const spacesValue = body?.spaces;
    if (!Array.isArray(spacesValue)) {
      return { spaces: [], stale: true };
    }

    let malformed = false;
    const spaces: SpaceRef[] = [];
    for (const item of spacesValue) {
      const itemObject = asObject(item);
      const uri = typeof itemObject?.uri === 'string' ? itemObject.uri : null;
      const space = uri ? parseProtocolSpaceUri(uri) : null;
      if (!space) {
        malformed = true;
        continue;
      }
      spaces.push(space);
    }

    return {
      spaces,
      cursor:
        typeof body?.cursor === 'string'
          ? (body.cursor as MembershipCursor)
          : undefined,
      stale: malformed,
      sourceRevision: result.sourceRevision,
    };
  }

  async getSpaceConfig(
    args: SpaceRef & {
      readonly consistency: MembershipConsistency;
    },
  ): Promise<SpaceConfigResult> {
    const spaceUri = formatProtocolSpaceUri(args);
    if (!spaceUri) {
      return { ok: false, space: args, reason: 'invalid-space', stale: true };
    }

    const result = await this.getJson(SPACE_XRPC_METHODS.getSpace, {
      space: spaceUri,
    });
    if (!result.ok) {
      return {
        ok: false,
        space: args,
        reason: result.reason,
        stale: result.stale,
      };
    }

    const body = asObject(result.body);
    const returnedSpace =
      typeof body?.uri === 'string' ? parseProtocolSpaceUri(body.uri) : null;
    const config = asObject(body?.config);
    if (!body || !returnedSpace || !config) {
      return { ok: false, space: args, reason: 'unavailable', stale: true };
    }

    return {
      ok: true,
      space: returnedSpace,
      config: config as UnknownLexiconObject,
      stale: false,
      sourceRevision: result.sourceRevision,
    };
  }

  async getDirectSpaceMembers(
    args: SpaceRef & {
      readonly consistency: MembershipConsistency;
    },
  ): Promise<ReadonlyArray<DirectSpaceMember>> {
    const loaded = await this.loadDirectMembers(args);
    if (!loaded.ok) {
      throw new Error(`Unable to load space members: ${loaded.reason}`);
    }
    return loaded.directMembers;
  }

  async resolveSpaceMembers(
    args: SpaceRef & {
      readonly consistency: MembershipConsistency;
      readonly resolverDepth?: number;
    },
  ): Promise<ResolvedMembers> {
    const loaded = await this.loadDirectMembers(args);
    if (!loaded.ok) {
      return {
        ok: false,
        directMembers: [],
        members: [],
        missingSpaces: [{ space: args, reason: loaded.reason }],
        partial: true,
        stale: loaded.stale,
        resolverDepth: args.resolverDepth ?? 0,
      };
    }

    return {
      ok: true,
      directMembers: loaded.directMembers,
      members: loaded.directMembers.flatMap((member) =>
        member.member.kind === 'did'
          ? [
              {
                did: member.member.did,
                via: [args],
                directMember: member.member,
                access: member.access,
                resolverDepth: 0,
              } satisfies ResolvedSpaceMember,
            ]
          : [],
      ),
      missingSpaces: [],
      partial: loaded.partial,
      stale: loaded.stale,
      resolverDepth: args.resolverDepth ?? 0,
      sourceRevision: loaded.sourceRevision,
    };
  }

  private async loadDirectMembers(
    args: SpaceRef & {
      readonly consistency: MembershipConsistency;
    },
  ): Promise<LoadDirectMembersResult> {
    const spaceUri = formatProtocolSpaceUri(args);
    if (!spaceUri) {
      return failDirectMembers('invalid-space', true);
    }

    const directMembers: DirectSpaceMember[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    let sourceRevision: string | undefined;

    for (let page = 0; page < this.maxPages(); page += 1) {
      const result = await this.getJson(SIMPLESPACE_XRPC_METHODS.listMembers, {
        space: spaceUri,
        limit: this.pageSize(),
        cursor,
      });
      if (!result.ok) {
        return failDirectMembers(result.reason, result.stale);
      }

      sourceRevision = result.sourceRevision ?? sourceRevision;
      const body = asObject(result.body);
      const membersValue = body?.members;
      if (!Array.isArray(membersValue)) {
        return failDirectMembers('unavailable', true);
      }

      for (const item of membersValue) {
        const itemObject = asObject(item);
        if (typeof itemObject?.did !== 'string') {
          return failDirectMembers('unavailable', true);
        }
        directMembers.push({
          member: { kind: 'did', did: itemObject.did as DID },
          source: {
            adapter: 'com.atproto.simplespace',
            space: spaceUri,
          },
        });
      }

      const nextCursor =
        typeof body?.cursor === 'string' && body.cursor.length > 0
          ? body.cursor
          : undefined;
      if (!nextCursor) {
        return {
          ok: true,
          directMembers,
          partial: false,
          stale: false,
          sourceRevision,
        };
      }

      if (args.consistency !== 'strict') {
        return {
          ok: true,
          directMembers,
          partial: true,
          stale: false,
          sourceRevision,
        };
      }

      if (seenCursors.has(nextCursor)) {
        return failDirectMembers('unavailable', true);
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }

    return failDirectMembers('unavailable', true);
  }

  private async getJson(
    nsid: string,
    params: Record<string, string | number | undefined>,
  ): Promise<XrpcResult> {
    const url = buildXrpcUrl(this.serviceUrl, nsid, params);

    let response: XrpcFetchResponse;
    try {
      response = await this.fetcher(url, {
        method: 'GET',
        headers: await this.requestHeaders(),
      });
    } catch {
      return { ok: false, reason: 'unavailable', stale: true };
    }

    const body = await responseJson(response);
    if (!response.ok) {
      const error = responseErrorName(body);
      if (response.status === 404 || error === 'SpaceNotFound') {
        return { ok: false, reason: 'not-found', stale: false };
      }
      return { ok: false, reason: 'unavailable', stale: true };
    }

    return {
      ok: true,
      body,
      sourceRevision:
        response.headers?.get('etag') ??
        response.headers?.get('x-revision') ??
        undefined,
    };
  }

  private async requestHeaders(): Promise<Record<string, string>> {
    const provided =
      typeof this.options.headers === 'function'
        ? await this.options.headers()
        : (this.options.headers ?? {});
    return {
      accept: 'application/json',
      ...provided,
    };
  }

  private pageSize(): number {
    return Math.min(
      DEFAULT_PAGE_SIZE,
      Math.max(1, this.options.pageSize ?? DEFAULT_PAGE_SIZE),
    );
  }

  private maxPages(): number {
    return Math.max(1, this.options.maxPages ?? DEFAULT_MAX_PAGES);
  }
}

export function formatProtocolSpaceUri(space: SpaceRef): string | null {
  if (!space.expectedSpaceType || space.spaceKey.length === 0) return null;
  const skey = encodeURIComponent(space.spaceKey);
  return `at://${space.arbiterDid}/${SPACE_MARKER}/${space.expectedSpaceType}/${skey}`;
}

export function parseProtocolSpaceUri(uri: string): SpaceRef | null {
  const prefix = 'at://';
  if (!uri.startsWith(prefix) || uri.includes('?') || uri.includes('#')) {
    return null;
  }
  const parts = uri.slice(prefix.length).split('/');
  if (parts.length !== 4 || parts[1] !== SPACE_MARKER) {
    return null;
  }
  const [arbiterDid, , expectedSpaceType, encodedSpaceKey] = parts;
  if (!arbiterDid || !expectedSpaceType || !encodedSpaceKey) return null;
  try {
    return {
      arbiterDid: arbiterDid as DID,
      expectedSpaceType,
      spaceKey: decodeURIComponent(encodedSpaceKey),
    };
  } catch {
    return null;
  }
}

function failDirectMembers(
  reason: LoadDirectMembersFailure['reason'],
  stale: boolean,
): LoadDirectMembersFailure {
  return {
    ok: false,
    directMembers: [],
    partial: true,
    stale,
    reason,
  };
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonObject;
}

function responseErrorName(body: unknown): string | undefined {
  const object = asObject(body);
  return typeof object?.error === 'string' ? object.error : undefined;
}

async function responseJson(response: XrpcFetchResponse): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function defaultFetch(): XrpcFetch {
  const fetcher = (globalThis as { fetch?: XrpcFetch }).fetch;
  if (!fetcher) {
    throw new Error('XrpcGroupDirectoryPort requires fetch');
  }
  return fetcher;
}

function buildXrpcUrl(
  serviceUrl: string,
  nsid: string,
  params: Record<string, string | number | undefined>,
): string {
  const query = Object.entries(params)
    .filter(
      (entry): entry is [string, string | number] => entry[1] !== undefined,
    )
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join('&');
  return `${serviceUrl}/xrpc/${nsid}${query ? `?${query}` : ''}`;
}
