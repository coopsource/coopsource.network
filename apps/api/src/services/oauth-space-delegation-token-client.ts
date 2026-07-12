import {
  SpaceCredentialError,
  type SpaceCredentialErrorKind,
  type SpaceDelegationTokenClientPort,
  type SpaceDelegationTokenRequest,
  type SpaceDelegationTokenResponse,
} from '@coopsource/spaces-consumer';
import type { OAuthManagingSpaceCredentialSessionSelector } from './oauth-managing-space-credential-session-selector.js';

const GET_DELEGATION_TOKEN_NSID = 'com.atproto.space.getDelegationToken';

type JsonObject = { readonly [key: string]: unknown };

export interface OAuthSpaceDelegationTokenClientOptions {
  readonly sessionSelector: Pick<
    OAuthManagingSpaceCredentialSessionSelector,
    'selectSession'
  >;
}

/**
 * Draft Proposal 0016/HappyView delegation-token client.
 *
 * The selected managing OAuth session owns Authorization, refresh, and DPoP
 * behavior. This adapter only formats the current XRPC request shape and maps
 * the unstable response into the stable spaces-consumer issuer port.
 */
export class OAuthSpaceDelegationTokenClient
  implements SpaceDelegationTokenClientPort
{
  constructor(private readonly opts: OAuthSpaceDelegationTokenClientOptions) {}

  async getDelegationToken(
    request: SpaceDelegationTokenRequest,
  ): Promise<SpaceDelegationTokenResponse> {
    const session = await this.opts.sessionSelector.selectSession(request.ref);
    if (!session) {
      throw new SpaceCredentialError(
        `No eligible managing OAuth session available for ${request.ref.arbiterDid}/${request.ref.spaceKey}`,
        'auth',
      );
    }

    const url = delegationTokenUrl(session.serviceUrl, request.space);
    let response: Awaited<ReturnType<typeof session.authenticatedFetch>>;
    try {
      response = await session.authenticatedFetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
      });
    } catch (err) {
      if (err instanceof SpaceCredentialError) throw err;
      throw new SpaceCredentialError(
        `Failed to call ${GET_DELEGATION_TOKEN_NSID}: ${errorMessage(err)}`,
        'unavailable',
      );
    }

    const body = await responseJson(response);
    if (!response.ok) {
      throw new SpaceCredentialError(
        responseErrorMessage(body) ??
          `${GET_DELEGATION_TOKEN_NSID} failed with HTTP ${response.status}`,
        errorKindForResponse(response.status, body),
      );
    }

    const output = asObject(body);
    const token =
      typeof output?.delegationToken === 'string'
        ? output.delegationToken
        : typeof output?.token === 'string'
          ? output.token
          : null;
    if (!token) {
      throw new SpaceCredentialError(
        `${GET_DELEGATION_TOKEN_NSID} response must include delegationToken`,
        'protocol',
      );
    }

    return { token };
  }
}

function delegationTokenUrl(serviceUrl: string, space: string): string {
  const base = serviceUrl.replace(/\/+$/, '');
  if (!base) {
    throw new SpaceCredentialError(
      `No PDS service URL available for ${GET_DELEGATION_TOKEN_NSID}`,
      'auth',
    );
  }
  const url = new URL(`${base}/xrpc/${GET_DELEGATION_TOKEN_NSID}`);
  url.searchParams.set('space', space);
  return url.toString();
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

function responseErrorMessage(body: unknown): string | undefined {
  const object = asObject(body);
  return typeof object?.message === 'string' ? object.message : undefined;
}

function responseErrorName(body: unknown): string | undefined {
  const object = asObject(body);
  return typeof object?.error === 'string' ? object.error : undefined;
}

function errorKindForResponse(
  status: number,
  body: unknown,
): SpaceCredentialErrorKind {
  const error = responseErrorName(body);
  if (error === 'SpaceNotFound' || error === 'SpaceDeleted') {
    return 'invalid-space';
  }
  if (error === 'NotAMember' || error === 'UserNotAuthorized') {
    return 'not-member';
  }
  if (error === 'AppNotAuthorized' || error === 'InvalidClientAttestation') {
    return 'client-policy';
  }
  if (error === 'InvalidDelegationToken' || error === 'NotAuthorized') {
    return 'auth';
  }
  if (status === 401 || status === 403) return 'auth';
  if (status >= 500) return 'unavailable';
  return 'protocol';
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonObject;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
