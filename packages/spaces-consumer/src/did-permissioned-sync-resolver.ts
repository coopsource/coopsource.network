import type { DID } from '@coopsource/common';
import {
  ATPROTO_ACCOUNT_VERIFICATION_METHOD_ID,
  ATPROTO_PDS_SERVICE_ID,
} from '@coopsource/lexicons';
import {
  DidSpaceAuthorityResolver,
  SpaceAuthorityResolutionError,
  type SpaceAuthorityDidDocument,
  type SpaceAuthorityDidResolver,
} from './space-authority-resolver.js';
import type { PermissionedRepoSigningKeyResolver } from './permissioned-sync.js';
import type { PermissionedSyncEndpointResolver } from './xrpc-permissioned-repo-port.js';
import type { SpaceRef } from './types.js';

/**
 * Resolves the Proposal 0016 space host, each writer's repo host, and each
 * writer's ATProto signing key from DID documents. It does not interpret a
 * writer inventory as cooperative membership.
 */
export class DidPermissionedSyncResolver
  implements
    PermissionedSyncEndpointResolver,
    PermissionedRepoSigningKeyResolver
{
  private readonly spaceAuthorities: DidSpaceAuthorityResolver;

  constructor(private readonly didResolver: SpaceAuthorityDidResolver) {
    this.spaceAuthorities = new DidSpaceAuthorityResolver(didResolver);
  }

  async resolveSpaceHost(space: SpaceRef): Promise<string> {
    return (await this.spaceAuthorities.resolve(space)).serviceUrl;
  }

  async resolveRepoHost(repoDid: DID): Promise<string> {
    const document = await this.resolveRepoDid(repoDid);
    const service = document.service?.find(
      (entry) =>
        entry.id === ATPROTO_PDS_SERVICE_ID ||
        entry.id === `${repoDid}${ATPROTO_PDS_SERVICE_ID}`,
    );
    if (!service) {
      throw new SpaceAuthorityResolutionError(
        'missing-service',
        `Repo ${repoDid} has no ${ATPROTO_PDS_SERVICE_ID} service`,
      );
    }
    return parseHttpUrl(service.serviceEndpoint, repoDid);
  }

  async resolveSigningKey(repoDid: DID): Promise<string> {
    const document = await this.resolveRepoDid(repoDid);
    const method = document.verificationMethod?.find(
      (entry) =>
        entry.id === ATPROTO_ACCOUNT_VERIFICATION_METHOD_ID ||
        entry.id === `${repoDid}${ATPROTO_ACCOUNT_VERIFICATION_METHOD_ID}`,
    );
    if (!method) {
      throw new SpaceAuthorityResolutionError(
        'missing-verification-method',
        `Repo ${repoDid} has no ${ATPROTO_ACCOUNT_VERIFICATION_METHOD_ID} verification method`,
      );
    }
    if (!method.publicKeyMultibase) {
      throw new SpaceAuthorityResolutionError(
        'missing-verification-method',
        `Repo ${repoDid} ${ATPROTO_ACCOUNT_VERIFICATION_METHOD_ID} verification method has no publicKeyMultibase`,
      );
    }
    return `did:key:${method.publicKeyMultibase}`;
  }

  private async resolveRepoDid(
    repoDid: DID,
  ): Promise<SpaceAuthorityDidDocument> {
    let document: SpaceAuthorityDidDocument;
    try {
      document = await this.didResolver.resolveDid(repoDid);
    } catch (error) {
      throw new SpaceAuthorityResolutionError(
        'unavailable',
        `Failed to resolve repo ${repoDid}: ${errorMessage(error)}`,
      );
    }
    if (document.id !== repoDid) {
      throw new SpaceAuthorityResolutionError(
        'did-mismatch',
        `Resolved DID document id ${document.id} does not match ${repoDid}`,
      );
    }
    return document;
  }
}

function parseHttpUrl(endpoint: unknown, repoDid: DID): string {
  if (typeof endpoint !== 'string') {
    throw new SpaceAuthorityResolutionError(
      'invalid-service',
      `Repo ${repoDid} service endpoint must be a URL string`,
    );
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new SpaceAuthorityResolutionError(
      'invalid-service',
      `Repo ${repoDid} service endpoint is not a valid URL`,
    );
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new SpaceAuthorityResolutionError(
      'invalid-service',
      `Repo ${repoDid} service endpoint must use HTTP or HTTPS`,
    );
  }
  return url.toString().replace(/\/+$/, '');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
