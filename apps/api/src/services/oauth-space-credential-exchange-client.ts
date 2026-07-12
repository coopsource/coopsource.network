import {
  SpaceCredentialError,
  type SpaceCredentialExchangeClientPort,
  type SpaceCredentialExchangeRequest,
  type SpaceCredentialExchangeResponse,
  type SpaceRef,
  type XrpcPermissionedRecordWriteFetch,
} from '@coopsource/spaces-consumer';

const GET_SPACE_CREDENTIAL_NSID = 'com.atproto.space.getSpaceCredential';

type JsonObject = { readonly [key: string]: unknown };
type CredentialFailureKind =
  | 'auth'
  | 'client-policy'
  | 'invalid-space'
  | 'not-member'
  | 'protocol'
  | 'unavailable';

export type SpaceAuthorityServiceUrlResolver = (
  ref: SpaceRef,
) => string | undefined | Promise<string | undefined>;

export interface OAuthSpaceCredentialExchangeClientOptions {
  readonly serviceUrlForSpaceAuthority: SpaceAuthorityServiceUrlResolver;
  readonly fetch?: XrpcPermissionedRecordWriteFetch;
}

/**
 * Draft Proposal 0016 credential exchange client.
 *
 * The delegation token is a bearer credential minted by the requesting user's
 * PDS. This client sends it only to the configured space-authority PDS and
 * keeps user authorization, app authorization, invalid-space, and upstream
 * outages distinct through SpaceCredentialError.kind.
 */
export class OAuthSpaceCredentialExchangeClient implements SpaceCredentialExchangeClientPort {
  private readonly fetcher: XrpcPermissionedRecordWriteFetch;

  constructor(
    private readonly opts: OAuthSpaceCredentialExchangeClientOptions,
  ) {
    this.fetcher = opts.fetch ?? defaultFetch();
  }

  async getSpaceCredential(
    request: SpaceCredentialExchangeRequest,
  ): Promise<SpaceCredentialExchangeResponse> {
    const serviceUrl = await this.opts.serviceUrlForSpaceAuthority(request.ref);
    if (!serviceUrl) {
      throw spaceCredentialError(
        `No space-authority PDS URL configured for ${request.ref.arbiterDid}/${request.ref.spaceKey}`,
        'invalid-space',
      );
    }

    const url = spaceCredentialUrl(serviceUrl);
    let response: Awaited<ReturnType<typeof this.fetcher>>;
    try {
      response = await this.fetcher(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${request.delegationToken}`,
        },
        body: JSON.stringify({
          space: request.space,
          ...(request.clientAttestation
            ? { clientAttestation: request.clientAttestation }
            : {}),
        }),
      });
    } catch (err) {
      if (err instanceof SpaceCredentialError) throw err;
      throw spaceCredentialError(
        `Failed to call ${GET_SPACE_CREDENTIAL_NSID}: ${errorMessage(err)}`,
        'unavailable',
      );
    }

    const body = await responseJson(response);
    if (!response.ok) {
      throw errorForResponse(response.status, body);
    }

    const output = asObject(body);
    const credential =
      typeof output?.credential === 'string' ? output.credential : null;
    if (!credential) {
      throw spaceCredentialError(
        `${GET_SPACE_CREDENTIAL_NSID} response must include credential`,
        'protocol',
      );
    }

    const expiresAt = parseOptionalExpiresAt(output?.expiresAt);
    return {
      credential,
      ...(expiresAt ? { expiresAt } : {}),
    };
  }
}

function spaceCredentialUrl(serviceUrl: string): string {
  const base = serviceUrl.replace(/\/+$/, '');
  if (!base) {
    throw spaceCredentialError(
      `No PDS service URL available for ${GET_SPACE_CREDENTIAL_NSID}`,
      'invalid-space',
    );
  }
  return `${base}/xrpc/${GET_SPACE_CREDENTIAL_NSID}`;
}

function errorForResponse(status: number, body: unknown): SpaceCredentialError {
  const error = responseErrorName(body);
  const message =
    responseErrorMessage(body) ??
    `${GET_SPACE_CREDENTIAL_NSID} failed with HTTP ${status}`;

  if (error === 'SpaceNotFound' || error === 'SpaceDeleted') {
    return spaceCredentialError(message, 'invalid-space');
  }
  if (error === 'UserNotAuthorized') {
    return spaceCredentialError(message, 'not-member');
  }
  if (error === 'AppNotAuthorized' || error === 'InvalidClientAttestation') {
    return spaceCredentialError(message, 'client-policy');
  }
  if (error === 'InvalidDelegationToken' || error === 'NotAuthorized') {
    return spaceCredentialError(message, 'auth');
  }
  if (status === 401 || status === 403) {
    return spaceCredentialError(message, 'auth');
  }
  if (status >= 500) {
    return spaceCredentialError(message, 'unavailable');
  }
  return spaceCredentialError(message, 'protocol');
}

function parseOptionalExpiresAt(value: unknown): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw spaceCredentialError(
      `${GET_SPACE_CREDENTIAL_NSID} expiresAt must be an ISO datetime string`,
      'protocol',
    );
  }
  const expiresAt = new Date(value);
  if (!Number.isFinite(expiresAt.getTime())) {
    throw spaceCredentialError(
      `${GET_SPACE_CREDENTIAL_NSID} expiresAt is not a valid datetime`,
      'protocol',
    );
  }
  return expiresAt;
}

function spaceCredentialError(
  message: string,
  kind: CredentialFailureKind,
): SpaceCredentialError {
  const err = new SpaceCredentialError(message);
  Object.defineProperty(err, 'kind', {
    value: kind,
    enumerable: true,
    configurable: true,
  });
  return err;
}

async function responseJson(response: {
  readonly json: () => Promise<unknown>;
  readonly text?: () => Promise<string>;
}): Promise<unknown> {
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function defaultFetch(): XrpcPermissionedRecordWriteFetch {
  const fetcher = (globalThis as { fetch?: XrpcPermissionedRecordWriteFetch })
    .fetch;
  if (!fetcher) {
    throw new Error('OAuthSpaceCredentialExchangeClient requires fetch');
  }
  return fetcher;
}
