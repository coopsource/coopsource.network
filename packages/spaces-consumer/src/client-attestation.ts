import { ATPROTO_SPACE_HOST_SERVICE_ID } from '@coopsource/lexicons';
import type { SpaceCredentialRefreshReason } from './credential-store.js';
import type { SpaceRef } from './types.js';

export interface ClientAttestationRequest {
  readonly ref: SpaceRef;
  readonly space: string;
  readonly clientId: string;
  readonly audience: string;
  readonly reason: SpaceCredentialRefreshReason;
  readonly now: Date;
}

export interface ClientAttestationProvider {
  getClientAttestation(
    request: ClientAttestationRequest,
  ): Promise<string | undefined>;
}

export interface ClientAttestationProtectedHeader {
  readonly typ: 'atproto-client-attestation+jwt';
  readonly alg: 'ES256';
  readonly kid: string;
}

export interface ClientAttestationClaims {
  readonly iss: string;
  readonly sub: string;
  readonly aud: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
}

export interface ClientAttestationJwtSigner {
  signJwt(input: {
    readonly protectedHeader: ClientAttestationProtectedHeader;
    readonly claims: ClientAttestationClaims;
  }): Promise<string>;
}

export interface Proposal0016ClientAttestationProviderOptions {
  readonly keyId: string;
  readonly signer: ClientAttestationJwtSigner;
  readonly ttlSeconds?: number;
  readonly createNonce?: () => string;
}

/**
 * Builds the short-lived, single-use client-attestation JWT described by
 * Proposal 0016. Key storage and cryptographic signing stay behind the signer
 * so production can use an HSM/KMS-backed ES256 key without changing the
 * credential flow.
 */
export class Proposal0016ClientAttestationProvider implements ClientAttestationProvider {
  private readonly ttlSeconds: number;
  private readonly createNonce: () => string;

  constructor(
    private readonly options: Proposal0016ClientAttestationProviderOptions,
  ) {
    this.ttlSeconds = options.ttlSeconds ?? 60;
    if (
      !Number.isSafeInteger(this.ttlSeconds) ||
      this.ttlSeconds < 1 ||
      this.ttlSeconds > 300
    ) {
      throw new Error(
        'Client attestation ttlSeconds must be an integer between 1 and 300',
      );
    }
    if (!options.keyId) {
      throw new Error('Client attestation keyId is required');
    }
    this.createNonce = options.createNonce ?? (() => crypto.randomUUID());
  }

  async getClientAttestation(
    request: ClientAttestationRequest,
  ): Promise<string> {
    const issuedAt = Math.floor(request.now.getTime() / 1000);
    if (!Number.isSafeInteger(issuedAt)) {
      throw new Error('Client attestation request time is invalid');
    }
    if (
      request.audience !==
      `${request.ref.arbiterDid}${ATPROTO_SPACE_HOST_SERVICE_ID}`
    ) {
      throw new Error(
        `Client attestation audience must target ${request.ref.arbiterDid}${ATPROTO_SPACE_HOST_SERVICE_ID}`,
      );
    }

    return this.options.signer.signJwt({
      protectedHeader: {
        typ: 'atproto-client-attestation+jwt',
        alg: 'ES256',
        kid: this.options.keyId,
      },
      claims: {
        iss: request.clientId,
        sub: request.clientId,
        aud: request.audience,
        iat: issuedAt,
        exp: issuedAt + this.ttlSeconds,
        jti: this.createNonce(),
      },
    });
  }
}
