import type { DID } from '@coopsource/common';
import {
  ATPROTO_ACCOUNT_VERIFICATION_METHOD_ID,
  ATPROTO_PDS_SERVICE_ID,
  ATPROTO_SPACE_HOST_SERVICE_ID,
  ATPROTO_SPACE_VERIFICATION_METHOD_ID,
} from '@coopsource/lexicons';
import type { SpaceRef } from './types.js';

export interface SpaceAuthorityServiceEntry {
  readonly id: string;
  readonly type?: string;
  readonly serviceEndpoint: unknown;
}

export interface SpaceAuthorityVerificationMethod {
  readonly id: string;
  readonly type?: string;
  readonly controller?: string;
  readonly publicKeyMultibase?: string;
  readonly publicKeyJwk?: Readonly<Record<string, unknown>>;
}

export interface SpaceAuthorityDidDocument {
  readonly id: DID;
  readonly service?: ReadonlyArray<SpaceAuthorityServiceEntry>;
  readonly verificationMethod?: ReadonlyArray<SpaceAuthorityVerificationMethod>;
}

export interface SpaceAuthorityDidResolver {
  resolveDid(did: DID): Promise<SpaceAuthorityDidDocument>;
}

export interface ResolvedSpaceAuthority {
  readonly did: DID;
  readonly serviceId: string;
  readonly serviceUrl: string;
  readonly verificationMethodId: string;
  readonly verificationMethod: SpaceAuthorityVerificationMethod;
}

export type SpaceAuthorityResolutionErrorKind =
  | 'did-mismatch'
  | 'invalid-service'
  | 'missing-service'
  | 'missing-verification-method'
  | 'unavailable';

export class SpaceAuthorityResolutionError extends Error {
  constructor(
    public readonly kind: SpaceAuthorityResolutionErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SpaceAuthorityResolutionError';
  }
}

/**
 * Resolves Proposal 0016 space-host and credential-verification DID entries.
 * Dedicated entries win; the account PDS/signing entries are the specified
 * fallback. Resolution is deliberately uncached here so callers can choose a
 * cache policy appropriate to credential issuance or security verification.
 */
export class DidSpaceAuthorityResolver {
  constructor(private readonly didResolver: SpaceAuthorityDidResolver) {}

  async resolve(ref: SpaceRef): Promise<ResolvedSpaceAuthority> {
    const authorityDid = ref.arbiterDid;
    let didDocument: SpaceAuthorityDidDocument;
    try {
      didDocument = await this.didResolver.resolveDid(authorityDid);
    } catch (err) {
      throw new SpaceAuthorityResolutionError(
        'unavailable',
        `Failed to resolve space authority ${authorityDid}: ${errorMessage(err)}`,
      );
    }

    if (didDocument.id !== authorityDid) {
      throw new SpaceAuthorityResolutionError(
        'did-mismatch',
        `Resolved DID document id ${didDocument.id} does not match ${authorityDid}`,
      );
    }

    const service =
      findDidEntry(
        didDocument.service,
        authorityDid,
        ATPROTO_SPACE_HOST_SERVICE_ID,
      ) ??
      findDidEntry(didDocument.service, authorityDid, ATPROTO_PDS_SERVICE_ID);
    if (!service) {
      throw new SpaceAuthorityResolutionError(
        'missing-service',
        `Space authority ${authorityDid} has neither ${ATPROTO_SPACE_HOST_SERVICE_ID} nor ${ATPROTO_PDS_SERVICE_ID}`,
      );
    }
    const serviceUrl = parseServiceUrl(service.serviceEndpoint, authorityDid);

    const verificationMethod =
      findDidEntry(
        didDocument.verificationMethod,
        authorityDid,
        ATPROTO_SPACE_VERIFICATION_METHOD_ID,
      ) ??
      findDidEntry(
        didDocument.verificationMethod,
        authorityDid,
        ATPROTO_ACCOUNT_VERIFICATION_METHOD_ID,
      );
    if (!verificationMethod) {
      throw new SpaceAuthorityResolutionError(
        'missing-verification-method',
        `Space authority ${authorityDid} has neither ${ATPROTO_SPACE_VERIFICATION_METHOD_ID} nor ${ATPROTO_ACCOUNT_VERIFICATION_METHOD_ID}`,
      );
    }

    return {
      did: authorityDid,
      serviceId: canonicalDidUrl(authorityDid, service.id),
      serviceUrl,
      verificationMethodId: canonicalDidUrl(
        authorityDid,
        verificationMethod.id,
      ),
      verificationMethod,
    };
  }
}

function findDidEntry<T extends { readonly id: string }>(
  entries: ReadonlyArray<T> | undefined,
  did: DID,
  fragment: string,
): T | undefined {
  return entries?.find(
    (entry) => entry.id === fragment || entry.id === `${did}${fragment}`,
  );
}

function canonicalDidUrl(did: DID, id: string): string {
  return id.startsWith('#') ? `${did}${id}` : id;
}

function parseServiceUrl(endpoint: unknown, did: DID): string {
  if (typeof endpoint !== 'string') {
    throw new SpaceAuthorityResolutionError(
      'invalid-service',
      `Space authority ${did} service endpoint must be a URL string`,
    );
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new SpaceAuthorityResolutionError(
      'invalid-service',
      `Space authority ${did} service endpoint is not a valid URL`,
    );
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new SpaceAuthorityResolutionError(
      'invalid-service',
      `Space authority ${did} service endpoint must use HTTP or HTTPS`,
    );
  }
  return url.toString().replace(/\/+$/, '');
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
