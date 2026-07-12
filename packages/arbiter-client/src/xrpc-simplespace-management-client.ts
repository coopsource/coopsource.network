import type { DID } from '@coopsource/common';
import type {
  SpaceRef,
  UnknownLexiconObject,
} from '@coopsource/spaces-consumer';
import {
  formatProtocolSpaceUri,
  parseProtocolSpaceUri,
} from './xrpc-group-directory-port.js';

const CREATE_SPACE_NSID = 'com.atproto.simplespace.createSpace';
const ADD_MEMBER_NSID = 'com.atproto.simplespace.addMember';
const REMOVE_MEMBER_NSID = 'com.atproto.simplespace.removeMember';

type JsonObject = { readonly [key: string]: unknown };

export interface XrpcSimpleSpaceManagementFetchInit {
  readonly method: 'POST';
  readonly headers: Record<string, string>;
  readonly body: string;
}

export interface XrpcSimpleSpaceManagementFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers?: {
    get(name: string): string | null;
  };
  json(): Promise<unknown>;
  text?(): Promise<string>;
}

export type XrpcSimpleSpaceManagementFetch = (
  url: string,
  init: XrpcSimpleSpaceManagementFetchInit,
) => Promise<XrpcSimpleSpaceManagementFetchResponse>;

export type XrpcSimpleSpaceManagementHeaderProvider =
  | Record<string, string>
  | ((
      request: XrpcSimpleSpaceManagementHeaderRequest,
    ) => Record<string, string> | Promise<Record<string, string>>);

export interface XrpcSimpleSpaceManagementHeaderRequest {
  readonly nsid: string;
  readonly url: string;
  readonly body: JsonObject;
}

export interface XrpcSimpleSpaceManagementClientOptions {
  readonly serviceUrl: string;
  readonly authenticatedFetch?: XrpcSimpleSpaceManagementFetch;
  readonly fetch?: XrpcSimpleSpaceManagementFetch;
  readonly headers?: XrpcSimpleSpaceManagementHeaderProvider;
}

export type XrpcSimpleSpaceManagementErrorKind =
  | 'auth'
  | 'conflict'
  | 'invalid-space'
  | 'not-owner'
  | 'protocol'
  | 'unavailable';

export class XrpcSimpleSpaceManagementError extends Error {
  constructor(
    public readonly kind: XrpcSimpleSpaceManagementErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'XrpcSimpleSpaceManagementError';
  }
}

export interface XrpcCreateSimpleSpaceRequest {
  readonly space: SpaceRef;
  readonly config?: UnknownLexiconObject;
}

export interface XrpcCreateSimpleSpaceResult {
  readonly space: SpaceRef;
  readonly uri: string;
  readonly sourceRevision?: string;
}

/**
 * Experimental client for the current draft `com.atproto.simplespace.*`
 * management procedures. This is a live-exercise helper, not CSN's default
 * group mutation adapter: the CSN-DB `GroupMutationPort` remains authoritative
 * until a stable Arbiter/space-management substrate exists.
 */
export class XrpcSimpleSpaceManagementClient {
  private readonly serviceUrl: string;
  private readonly fetcher: XrpcSimpleSpaceManagementFetch;

  constructor(
    private readonly options: XrpcSimpleSpaceManagementClientOptions,
  ) {
    this.serviceUrl = options.serviceUrl.replace(/\/+$/, '');
    this.fetcher =
      options.authenticatedFetch ?? options.fetch ?? defaultFetch();
  }

  async createSpace(
    request: XrpcCreateSimpleSpaceRequest,
  ): Promise<XrpcCreateSimpleSpaceResult> {
    if (!request.space.expectedSpaceType) {
      throw new XrpcSimpleSpaceManagementError(
        'invalid-space',
        'simplespace.createSpace requires SpaceRef.expectedSpaceType',
      );
    }
    if (!request.space.spaceKey) {
      throw new XrpcSimpleSpaceManagementError(
        'invalid-space',
        'simplespace.createSpace requires SpaceRef.spaceKey',
      );
    }

    const response = await this.postJson(CREATE_SPACE_NSID, {
      did: request.space.arbiterDid,
      type: request.space.expectedSpaceType,
      skey: request.space.spaceKey,
      ...(request.config ? { config: request.config } : {}),
    });
    const body = asObject(response.body);
    const uri = typeof body?.uri === 'string' ? body.uri : null;
    const returnedSpace = uri ? parseProtocolSpaceUri(uri) : null;
    if (!uri || !returnedSpace) {
      throw new XrpcSimpleSpaceManagementError(
        'protocol',
        `${CREATE_SPACE_NSID} response must include a space URI`,
      );
    }
    if (!sameSpace(returnedSpace, request.space)) {
      throw new XrpcSimpleSpaceManagementError(
        'protocol',
        `${CREATE_SPACE_NSID} returned ${uri}, expected ${formatRequiredSpaceUri(
          request.space,
        )}`,
      );
    }

    return {
      space: returnedSpace,
      uri,
      ...(response.sourceRevision && {
        sourceRevision: response.sourceRevision,
      }),
    };
  }

  async addMember(args: {
    readonly space: SpaceRef;
    readonly memberDid: DID;
  }): Promise<void> {
    await this.postJson(ADD_MEMBER_NSID, {
      space: formatRequiredSpaceUri(args.space),
      did: args.memberDid,
    });
  }

  async removeMember(args: {
    readonly space: SpaceRef;
    readonly memberDid: DID;
  }): Promise<void> {
    await this.postJson(REMOVE_MEMBER_NSID, {
      space: formatRequiredSpaceUri(args.space),
      did: args.memberDid,
    });
  }

  private async postJson(
    nsid: string,
    body: JsonObject,
  ): Promise<{ readonly body: unknown; readonly sourceRevision?: string }> {
    if (!this.serviceUrl) {
      throw new XrpcSimpleSpaceManagementError(
        'auth',
        `${nsid} requires a PDS service URL`,
      );
    }

    const url = `${this.serviceUrl}/xrpc/${nsid}`;
    const headers = await this.requestHeaders({ nsid, url, body });

    let response: XrpcSimpleSpaceManagementFetchResponse;
    try {
      response = await this.fetcher(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (err instanceof XrpcSimpleSpaceManagementError) throw err;
      throw new XrpcSimpleSpaceManagementError(
        'unavailable',
        `Failed to call ${nsid}: ${errorMessage(err)}`,
      );
    }

    const responseBody = await responseJson(response);
    if (!response.ok) {
      throw errorForResponse(nsid, response.status, responseBody);
    }

    return {
      body: responseBody,
      sourceRevision:
        response.headers?.get('etag') ??
        response.headers?.get('x-revision') ??
        undefined,
    };
  }

  private async requestHeaders(
    request: XrpcSimpleSpaceManagementHeaderRequest,
  ): Promise<Record<string, string>> {
    const provided =
      typeof this.options.headers === 'function'
        ? await this.options.headers(request)
        : this.options.headers;
    const headers = {
      accept: 'application/json',
      'content-type': 'application/json',
      ...provided,
    };
    if (!this.options.authenticatedFetch && !hasAuthorizationHeader(headers)) {
      throw new XrpcSimpleSpaceManagementError(
        'auth',
        `${request.nsid} requires an OAuth authorization header`,
      );
    }
    return headers;
  }
}

function formatRequiredSpaceUri(space: SpaceRef): string {
  const uri = formatProtocolSpaceUri(space);
  if (!uri) {
    throw new XrpcSimpleSpaceManagementError(
      'invalid-space',
      'simplespace member management requires SpaceRef.expectedSpaceType and spaceKey',
    );
  }
  return uri;
}

function sameSpace(left: SpaceRef, right: SpaceRef): boolean {
  return (
    left.arbiterDid === right.arbiterDid &&
    left.spaceKey === right.spaceKey &&
    left.expectedSpaceType === right.expectedSpaceType
  );
}

function errorForResponse(
  nsid: string,
  status: number,
  body: unknown,
): XrpcSimpleSpaceManagementError {
  const error = responseErrorName(body);
  const message =
    responseErrorMessage(body) ?? `${nsid} failed with HTTP ${status}`;

  if (error === 'SpaceAlreadyExists' || status === 409) {
    return new XrpcSimpleSpaceManagementError('conflict', message);
  }
  if (error === 'SpaceNotFound' || error === 'InvalidType' || status === 404) {
    return new XrpcSimpleSpaceManagementError('invalid-space', message);
  }
  if (error === 'NotSpaceOwner') {
    return new XrpcSimpleSpaceManagementError('not-owner', message);
  }
  if (status === 401 || status === 403) {
    return new XrpcSimpleSpaceManagementError('auth', message);
  }
  if (status >= 500) {
    return new XrpcSimpleSpaceManagementError('unavailable', message);
  }
  return new XrpcSimpleSpaceManagementError('protocol', message);
}

function responseErrorName(body: unknown): string | undefined {
  const object = asObject(body);
  return typeof object?.error === 'string' ? object.error : undefined;
}

function responseErrorMessage(body: unknown): string | undefined {
  const object = asObject(body);
  return typeof object?.message === 'string' ? object.message : undefined;
}

async function responseJson(
  response: XrpcSimpleSpaceManagementFetchResponse,
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

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonObject;
}

function hasAuthorizationHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some(
    (key) => key.toLowerCase() === 'authorization',
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function defaultFetch(): XrpcSimpleSpaceManagementFetch {
  const fetcher = (globalThis as { fetch?: XrpcSimpleSpaceManagementFetch })
    .fetch;
  if (!fetcher) {
    throw new Error('XrpcSimpleSpaceManagementClient requires fetch');
  }
  return fetcher;
}
