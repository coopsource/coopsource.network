import type { DID, Permission } from '@coopsource/common';
import {
  SpaceCredentialError,
  type XrpcPermissionedRecordWriteFetch,
} from '@coopsource/spaces-consumer';
import type { SpaceRef } from '@coopsource/spaces-consumer';
import type { MembershipReadModel } from './membership-read-model.js';
import type {
  OAuthPermissionedRecordWriteClient,
  OAuthPermissionedRecordWriteSession,
} from './oauth-permissioned-record-write-session-provider.js';

export interface ManagingSpaceSessionCandidateProvider {
  listCandidates(ref: SpaceRef): Promise<readonly DID[]>;
}

export interface OAuthManagingSpaceCredentialSession {
  readonly managerDid: DID;
  readonly serviceUrl: string;
  readonly authenticatedFetch: XrpcPermissionedRecordWriteFetch;
}

export interface OAuthManagingSpaceCredentialSessionSelectorOptions {
  readonly oauthClient?: OAuthPermissionedRecordWriteClient;
  readonly membershipReadModel: Pick<
    MembershipReadModel,
    'hasPermissionResult'
  >;
  readonly candidateProvider: ManagingSpaceSessionCandidateProvider;
  readonly requiredPermission: Permission;
}

/**
 * Selects a cooperative-designated OAuth session for background AppView sync.
 *
 * This intentionally does not borrow arbitrary active member sessions. The
 * candidate provider owns designation; this selector verifies each candidate
 * through the membership read seam before restoring OAuth.
 */
export class OAuthManagingSpaceCredentialSessionSelector {
  private oauthClient: OAuthPermissionedRecordWriteClient | undefined;

  constructor(
    private readonly opts: OAuthManagingSpaceCredentialSessionSelectorOptions,
  ) {
    this.oauthClient = opts.oauthClient;
  }

  setOAuthClient(client: OAuthPermissionedRecordWriteClient): void {
    this.oauthClient = client;
  }

  async selectSession(
    ref: SpaceRef,
  ): Promise<OAuthManagingSpaceCredentialSession | null> {
    if (!this.oauthClient) return null;

    const candidates = await this.opts.candidateProvider.listCandidates(ref);
    for (const candidateDid of candidates) {
      const eligibility =
        await this.opts.membershipReadModel.hasPermissionResult(
          ref.arbiterDid,
          candidateDid,
          this.opts.requiredPermission,
        );
      if (!eligibility.ok || !eligibility.allowed) continue;

      const session = await this.restore(candidateDid);
      if (!session) continue;

      if (session.did && session.did !== candidateDid) {
        throw new SpaceCredentialError(
          `OAuth managing session DID mismatch: session has ${session.did} but candidate is ${candidateDid}`,
        );
      }

      const selected = await this.sessionForCandidate(candidateDid, session);
      if (selected) return selected;
    }

    return null;
  }

  private async restore(
    candidateDid: DID,
  ): Promise<OAuthPermissionedRecordWriteSession | null> {
    try {
      return await this.oauthClient!.restore(candidateDid);
    } catch {
      return null;
    }
  }

  private async sessionForCandidate(
    candidateDid: DID,
    session: OAuthPermissionedRecordWriteSession,
  ): Promise<OAuthManagingSpaceCredentialSession | null> {
    let tokenInfo: { readonly aud: string };
    try {
      tokenInfo = await session.getTokenInfo('auto');
    } catch {
      return null;
    }

    if (!tokenInfo.aud) return null;

    try {
      return {
        managerDid: candidateDid,
        serviceUrl: tokenInfo.aud,
        authenticatedFetch: authenticatedFetchForSession(
          session,
          tokenInfo.aud,
        ),
      };
    } catch (err) {
      if (err instanceof SpaceCredentialError) return null;
      throw err;
    }
  }
}

export class StaticManagingSpaceSessionCandidateProvider implements ManagingSpaceSessionCandidateProvider {
  constructor(private readonly candidates: readonly DID[]) {}

  async listCandidates(): Promise<readonly DID[]> {
    await Promise.resolve();
    return this.candidates;
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
      throw new SpaceCredentialError(
        `OAuth managing session audience ${expectedOrigin} cannot call ${target.origin}`,
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
    throw new SpaceCredentialError(
      `OAuth managing session audience is not a valid URL: ${audience}`,
    );
  }
}
