import type { CID, DID } from '@coopsource/common';
import type {
  PermissionedRecordCreateRequest,
  PermissionedRecordDeleteRequest,
  PermissionedRecordWritePort,
  PermissionedRecordWriteResult,
} from './permissioned-record-write-port.js';
import { PermissionedRecordWriteError } from './permissioned-record-write-port.js';
import {
  formatSpaceRecordUri,
  formatSpaceUri,
  parseSpaceRecordUri,
} from './space-uri.js';
import type { PermissionedRecordLocation, SpaceRef } from './types.js';

const CREATE_RECORD_NSID = 'com.atproto.space.createRecord';
const DELETE_RECORD_NSID = 'com.atproto.space.deleteRecord';

type JsonObject = { readonly [key: string]: unknown };

export interface XrpcPermissionedRecordWriteFetchInit {
  readonly method: 'POST';
  readonly headers: Record<string, string>;
  readonly body: string;
}

export interface XrpcPermissionedRecordWriteFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers?: {
    get(name: string): string | null;
  };
  json(): Promise<unknown>;
  text?(): Promise<string>;
}

export type XrpcPermissionedRecordWriteFetch = (
  url: string,
  init: XrpcPermissionedRecordWriteFetchInit,
) => Promise<XrpcPermissionedRecordWriteFetchResponse>;

export type XrpcPermissionedRecordWriteOperation =
  | 'createRecord'
  | 'deleteRecord';

export type XrpcPermissionedRecordWriteArgs =
  | PermissionedRecordCreateRequest
  | PermissionedRecordDeleteRequest;

export interface XrpcPermissionedRecordWriteHeaderRequest {
  readonly operation: XrpcPermissionedRecordWriteOperation;
  readonly nsid: string;
  readonly url: string;
  readonly body: JsonObject;
  readonly args: XrpcPermissionedRecordWriteArgs;
}

export type XrpcPermissionedRecordWriteHeaderProvider =
  | Record<string, string>
  | ((
      request: XrpcPermissionedRecordWriteHeaderRequest,
    ) => Record<string, string> | Promise<Record<string, string>>);

export interface XrpcPermissionedRecordWriteSession {
  /**
   * Author's PDS / repo-host endpoint. The adapter posts to this service's
   * `com.atproto.space.*` write methods because space writes are attributed to
   * the authoring user and require the author's OAuth session.
   */
  readonly serviceUrl: string;
  /**
   * Optional session-bound transport, for OAuth libraries that inject
   * Authorization/DPoP headers and refresh tokens inside their fetch handler.
   * When this is provided, the adapter does not require a visible
   * authorization header from `accessToken` or `headers`.
   */
  readonly authenticatedFetch?: XrpcPermissionedRecordWriteFetch;
  /**
   * Optional bearer token convenience for ordinary OAuth sessions. DPoP or
   * other request-bound proof headers can be supplied through `headers`.
   */
  readonly accessToken?: string;
  readonly headers?: XrpcPermissionedRecordWriteHeaderProvider;
}

export interface XrpcPermissionedRecordWriteSessionRequest {
  readonly operation: XrpcPermissionedRecordWriteOperation;
  readonly args: XrpcPermissionedRecordWriteArgs;
}

export type XrpcPermissionedRecordWriteSessionProvider = (
  request: XrpcPermissionedRecordWriteSessionRequest,
) =>
  | XrpcPermissionedRecordWriteSession
  | null
  | Promise<XrpcPermissionedRecordWriteSession | null>;

export interface XrpcPermissionedRecordWritePortOptions {
  readonly sessionProvider: XrpcPermissionedRecordWriteSessionProvider;
  readonly fetch?: XrpcPermissionedRecordWriteFetch;
  readonly validate?: boolean;
}

/**
 * Draft Proposal 0016 XRPC writer for permissioned records.
 *
 * The implementation intentionally targets real HTTP/XRPC semantics and stays
 * behind `PermissionedRecordWritePort`. It is not a local storage fake: callers
 * must provide an author session that can reach the author's PDS with a
 * covering `space:` OAuth grant.
 */
export class XrpcPermissionedRecordWritePort
  implements PermissionedRecordWritePort
{
  private readonly fetcher: XrpcPermissionedRecordWriteFetch;

  constructor(private readonly options: XrpcPermissionedRecordWritePortOptions) {
    this.fetcher = options.fetch ?? defaultFetch();
  }

  async createRecord(
    args: PermissionedRecordCreateRequest,
  ): Promise<PermissionedRecordWriteResult> {
    const space = formatSpaceRefUri(args.space);
    const body = withoutUndefined({
      space,
      repo: args.authorDid,
      collection: args.collection,
      rkey: args.rkey,
      validate: this.options.validate,
      record: args.record,
    });

    const response = await this.postJson({
      operation: 'createRecord',
      nsid: CREATE_RECORD_NSID,
      body,
      args,
    });

    const output = asObject(response.body);
    const uri = typeof output?.uri === 'string' ? output.uri : null;
    const cid = typeof output?.cid === 'string' ? output.cid : null;
    if (!uri || !cid) {
      throw new PermissionedRecordWriteError(
        'protocol',
        `${CREATE_RECORD_NSID} response must include uri and cid`,
      );
    }

    const location = locationFromResponseUri(uri, args);
    return {
      location,
      cid: cid as CID,
      ...(response.sourceRevision && {
        sourceRevision: response.sourceRevision,
      }),
    };
  }

  async deleteRecord(args: PermissionedRecordDeleteRequest): Promise<void> {
    const space = formatSpaceRefUri(args.space);
    await this.postJson({
      operation: 'deleteRecord',
      nsid: DELETE_RECORD_NSID,
      body: {
        space,
        repo: args.authorDid,
        collection: args.collection,
        rkey: args.rkey,
      },
      args,
    });
  }

  private async postJson(params: {
    readonly operation: XrpcPermissionedRecordWriteOperation;
    readonly nsid: string;
    readonly body: JsonObject;
    readonly args: XrpcPermissionedRecordWriteArgs;
  }): Promise<{ readonly body: unknown; readonly sourceRevision?: string }> {
    const session = await this.options.sessionProvider({
      operation: params.operation,
      args: params.args,
    });
    if (!session) {
      throw new PermissionedRecordWriteError(
        'auth',
        `No OAuth session available for ${params.args.authorDid}`,
      );
    }
    const serviceUrl = session.serviceUrl.replace(/\/+$/, '');
    if (!serviceUrl) {
      throw new PermissionedRecordWriteError(
        'auth',
        `No PDS service URL available for ${params.args.authorDid}`,
      );
    }

    const url = `${serviceUrl}/xrpc/${params.nsid}`;
    const body = JSON.stringify(params.body);
    const headers = await this.requestHeaders({
      ...params,
      session,
      url,
    });

    let response: XrpcPermissionedRecordWriteFetchResponse;
    try {
      const fetcher = session.authenticatedFetch ?? this.fetcher;
      response = await fetcher(url, {
        method: 'POST',
        headers,
        body,
      });
    } catch (err) {
      throw new PermissionedRecordWriteError(
        'unavailable',
        `Failed to call ${params.nsid}: ${errorMessage(err)}`,
      );
    }

    const responseBody = await responseJson(response);
    if (!response.ok) {
      throw errorForResponse(params.nsid, response.status, responseBody);
    }

    return {
      body: responseBody,
      sourceRevision:
        response.headers?.get('etag') ??
        response.headers?.get('x-revision') ??
        undefined,
    };
  }

  private async requestHeaders(params: {
    readonly operation: XrpcPermissionedRecordWriteOperation;
    readonly nsid: string;
    readonly url: string;
    readonly body: JsonObject;
    readonly args: XrpcPermissionedRecordWriteArgs;
    readonly session: XrpcPermissionedRecordWriteSession;
  }): Promise<Record<string, string>> {
    const provided =
      typeof params.session.headers === 'function'
        ? await params.session.headers(params)
        : (params.session.headers ?? {});
    const headers = {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(params.session.accessToken
        ? { authorization: `Bearer ${params.session.accessToken}` }
        : {}),
      ...provided,
    };

    if (!params.session.authenticatedFetch && !hasAuthorizationHeader(headers)) {
      throw new PermissionedRecordWriteError(
        'auth',
        `Permissioned write to ${params.nsid} requires an OAuth authorization header`,
      );
    }

    return headers;
  }
}

export function formatPermissionedSpaceLocationUri(space: SpaceRef): string {
  return formatSpaceRefUri(space);
}

function formatSpaceRefUri(space: SpaceRef): string {
  if (!space.expectedSpaceType) {
    throw new PermissionedRecordWriteError(
      'invalid-space',
      'Permissioned space URI formatting requires SpaceRef.expectedSpaceType',
    );
  }
  if (!space.spaceKey) {
    throw new PermissionedRecordWriteError(
      'invalid-space',
      'Permissioned space URI formatting requires SpaceRef.spaceKey',
    );
  }
  return formatSpaceUri({
    spaceDid: space.arbiterDid,
    spaceType: space.expectedSpaceType,
    skey: space.spaceKey,
  });
}

function locationFromResponseUri(
  uri: string,
  args: PermissionedRecordCreateRequest,
): PermissionedRecordLocation {
  const parsed = parseSpaceRecordUri(uri);
  const expectedUri =
    args.rkey &&
    formatSpaceRecordUri({
      spaceDid: args.space.arbiterDid,
      spaceType: args.space.expectedSpaceType ?? '',
      skey: args.space.spaceKey,
      authorDid: args.authorDid,
      collection: args.collection,
      rkey: args.rkey,
    });

  if (!parsed) {
    throw new PermissionedRecordWriteError(
      'protocol',
      `${CREATE_RECORD_NSID} returned a non-space record URI`,
    );
  }

  if (
    parsed.spaceDid !== args.space.arbiterDid ||
    parsed.spaceType !== args.space.expectedSpaceType ||
    parsed.skey !== args.space.spaceKey ||
    parsed.authorDid !== args.authorDid ||
    parsed.collection !== args.collection ||
    (args.rkey && parsed.rkey !== args.rkey)
  ) {
    throw new PermissionedRecordWriteError(
      'protocol',
      `${CREATE_RECORD_NSID} returned ${uri}, expected ${expectedUri || 'the requested space/repo/collection'}`,
    );
  }

  return {
    space: args.space,
    authorDid: parsed.authorDid as DID,
    collection: parsed.collection,
    rkey: parsed.rkey,
  };
}

function errorForResponse(
  nsid: string,
  status: number,
  body: unknown,
): PermissionedRecordWriteError {
  const error = responseErrorName(body);
  const message =
    responseErrorMessage(body) ?? `${nsid} failed with HTTP ${status}`;

  if (error === 'SpaceNotFound') {
    return new PermissionedRecordWriteError('invalid-space', message);
  }
  if (error === 'NotAMember') {
    return new PermissionedRecordWriteError('not-member', message);
  }
  if (error === 'RecordNotFound') {
    return new PermissionedRecordWriteError('not-found', message);
  }
  if (error === 'RecordAlreadyExists' || status === 409) {
    return new PermissionedRecordWriteError('conflict', message);
  }
  if (status === 401 || status === 403) {
    return new PermissionedRecordWriteError('auth', message);
  }
  if (status >= 500) {
    return new PermissionedRecordWriteError('unavailable', message);
  }
  return new PermissionedRecordWriteError('protocol', message);
}

function responseErrorName(body: unknown): string | undefined {
  const object = asObject(body);
  return typeof object?.error === 'string' ? object.error : undefined;
}

function responseErrorMessage(body: unknown): string | undefined {
  const object = asObject(body);
  return typeof object?.message === 'string' ? object.message : undefined;
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonObject;
}

async function responseJson(
  response: XrpcPermissionedRecordWriteFetchResponse,
): Promise<unknown> {
  if (response.text) {
    try {
      const text = await response.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return { message: text };
      }
    } catch {
      return null;
    }
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function withoutUndefined(values: JsonObject): JsonObject {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function hasAuthorizationHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some(
    (key) => key.toLowerCase() === 'authorization',
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function defaultFetch(): XrpcPermissionedRecordWriteFetch {
  const fetcher = (globalThis as { fetch?: XrpcPermissionedRecordWriteFetch })
    .fetch;
  if (!fetcher) {
    throw new Error('XrpcPermissionedRecordWritePort requires fetch');
  }
  return fetcher;
}
