import type {
  XrpcPermissionedRecordWriteFetch,
  XrpcPermissionedRecordWriteSession,
  XrpcPermissionedRecordWriteSessionProvider,
  XrpcPermissionedRecordWriteSessionRequest,
} from '@coopsource/spaces-consumer';
import { PermissionedRecordWriteError } from '@coopsource/spaces-consumer';

export interface OAuthPermissionedRecordWriteSession {
  readonly did?: string;
  getTokenInfo(refresh?: boolean | 'auto'): Promise<{
    readonly aud: string;
  }>;
  fetchHandler(pathname: string, init?: RequestInit): Promise<Response>;
}

export interface OAuthPermissionedRecordWriteClient {
  restore(
    did: string,
    refresh?: boolean | 'auto',
  ): Promise<OAuthPermissionedRecordWriteSession>;
}

/**
 * Bridges CSN's permissioned-record writer to the existing atproto OAuth
 * session store.
 *
 * The session's own fetch handler is deliberately reused so token refresh,
 * Authorization scheme selection, and DPoP proof generation stay inside the
 * OAuth library instead of being reconstructed from stored token JSON.
 */
export class OAuthPermissionedRecordWriteSessionProvider {
  constructor(private oauthClient: OAuthPermissionedRecordWriteClient | undefined) {}

  setOAuthClient(client: OAuthPermissionedRecordWriteClient): void {
    this.oauthClient = client;
  }

  readonly sessionProvider: XrpcPermissionedRecordWriteSessionProvider = (
    request,
  ) => this.sessionForWrite(request);

  async sessionForWrite(
    request: XrpcPermissionedRecordWriteSessionRequest,
  ): Promise<XrpcPermissionedRecordWriteSession | null> {
    if (!this.oauthClient) return null;

    let session: OAuthPermissionedRecordWriteSession;
    try {
      session = await this.oauthClient.restore(request.args.authorDid);
    } catch {
      return null;
    }

    if (session.did && session.did !== request.args.authorDid) {
      throw new PermissionedRecordWriteError(
        'auth',
        `OAuth session DID mismatch: session has ${session.did} but permissioned write requested for ${request.args.authorDid}`,
      );
    }

    const tokenInfo = await session.getTokenInfo('auto');
    if (!tokenInfo.aud) {
      throw new PermissionedRecordWriteError(
        'auth',
        `OAuth session for ${request.args.authorDid} has no PDS audience`,
      );
    }

    return {
      serviceUrl: tokenInfo.aud,
      authenticatedFetch: authenticatedFetchForSession(session, tokenInfo.aud),
    };
  }
}

function authenticatedFetchForSession(
  session: OAuthPermissionedRecordWriteSession,
  audience: string,
): XrpcPermissionedRecordWriteFetch {
  const expectedOrigin = originForAudience(audience);
  return async (url, init) => {
    const target = new URL(url);
    if (target.origin !== expectedOrigin) {
      throw new PermissionedRecordWriteError(
        'auth',
        `OAuth session audience ${expectedOrigin} cannot call ${target.origin}`,
      );
    }
    return session.fetchHandler(`${target.pathname}${target.search}`, {
      method: init.method,
      headers: init.headers,
      body: init.body,
    });
  };
}

function originForAudience(audience: string): string {
  try {
    return new URL(audience).origin;
  } catch {
    throw new PermissionedRecordWriteError(
      'auth',
      `OAuth session audience is not a valid URL: ${audience}`,
    );
  }
}
