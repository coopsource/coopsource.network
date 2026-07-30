import { ATPROTO_SPACE_HOST_SERVICE_ID } from '@coopsource/lexicons';
import type { ClientAttestationProvider } from './client-attestation.js';
import {
  SpaceCredentialError,
  type SpaceCredential,
  type SpaceCredentialIssueRequest,
  type SpaceCredentialIssuerPort,
  type SpaceCredentialRefreshReason,
} from './credential-store.js';
import { formatSpaceUri } from './space-uri.js';
import type { SpaceRef } from './types.js';

export interface SpaceDelegationTokenRequest {
  readonly ref: SpaceRef;
  readonly space: string;
  readonly clientId: string;
  readonly reason: SpaceCredentialRefreshReason;
  readonly previous?: SpaceCredential;
  readonly now: Date;
}

export interface SpaceDelegationTokenResponse {
  readonly token: string;
}

export interface SpaceCredentialExchangeRequest {
  readonly ref: SpaceRef;
  readonly space: string;
  readonly clientId: string;
  readonly delegationToken: string;
  readonly clientAttestation?: string;
  readonly reason: SpaceCredentialRefreshReason;
  readonly previous?: SpaceCredential;
  readonly now: Date;
}

export interface SpaceCredentialExchangeResponse {
  readonly credential: string;
  readonly expiresAt?: Date;
}

export interface SpaceDelegationTokenClientPort {
  getDelegationToken(
    request: SpaceDelegationTokenRequest,
  ): Promise<SpaceDelegationTokenResponse>;
}

export interface SpaceCredentialExchangeClientPort {
  getSpaceCredential(
    request: SpaceCredentialExchangeRequest,
  ): Promise<SpaceCredentialExchangeResponse>;
}

export interface TwoStepSpaceCredentialIssuerOptions {
  readonly clientId: string;
  readonly spaceUriForRef?: (ref: SpaceRef) => string;
  readonly clientAttestationProvider?: ClientAttestationProvider;
}

/**
 * Draft issuer adapter for the upstream permissioned-data credential flow:
 * member PDS getDelegationToken -> space-owner PDS getSpaceCredential.
 *
 * The XRPC transport stays behind the two client ports because the upstream
 * `com.atproto.space.*` surface is still changing. This class owns sequencing,
 * cache-facing expiry extraction, and request metadata propagation.
 */
export class TwoStepSpaceCredentialIssuer implements SpaceCredentialIssuerPort {
  constructor(
    private readonly delegations: SpaceDelegationTokenClientPort,
    private readonly credentials: SpaceCredentialExchangeClientPort,
    private readonly opts: TwoStepSpaceCredentialIssuerOptions,
  ) {}

  async issue(request: SpaceCredentialIssueRequest): Promise<SpaceCredential> {
    const space = (this.opts.spaceUriForRef ?? formatSpaceCredentialSpaceUri)(
      request.ref,
    );
    const delegationResponse = await this.delegations.getDelegationToken({
      ref: request.ref,
      space,
      clientId: this.opts.clientId,
      reason: request.reason,
      previous: request.previous,
      now: request.now,
    });
    if (!delegationResponse.token) {
      throw new SpaceCredentialError(
        'Delegation token response did not include a token',
      );
    }

    const clientAttestation =
      await this.opts.clientAttestationProvider?.getClientAttestation({
        ref: request.ref,
        space,
        clientId: this.opts.clientId,
        audience: `${request.ref.arbiterDid}${ATPROTO_SPACE_HOST_SERVICE_ID}`,
        reason: request.reason,
        now: request.now,
      });
    const credentialResponse = await this.credentials.getSpaceCredential({
      ref: request.ref,
      space,
      clientId: this.opts.clientId,
      delegationToken: delegationResponse.token,
      ...(clientAttestation ? { clientAttestation } : {}),
      reason: request.reason,
      previous: request.previous,
      now: request.now,
    });
    if (!credentialResponse.credential) {
      throw new SpaceCredentialError(
        'Space credential response did not include a credential token',
      );
    }

    const expiresAt =
      credentialResponse.expiresAt ??
      expiresAtFromJwt(credentialResponse.credential);
    if (!expiresAt) {
      throw new SpaceCredentialError(
        'Space credential response must include expiresAt or a JWT exp claim',
      );
    }
    if (!Number.isFinite(expiresAt.getTime())) {
      throw new SpaceCredentialError(
        'Space credential response included an invalid expiry',
      );
    }

    return {
      token: credentialResponse.credential,
      expiresAt,
    };
  }
}

export function formatSpaceCredentialSpaceUri(ref: SpaceRef): string {
  if (!ref.expectedSpaceType) {
    throw new SpaceCredentialError(
      'Cannot format a space credential URI without expectedSpaceType',
    );
  }
  return formatSpaceUri({
    spaceDid: ref.arbiterDid,
    spaceType: ref.expectedSpaceType,
    skey: ref.spaceKey,
  });
}

function expiresAtFromJwt(token: string): Date | undefined {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return undefined;

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return undefined;
  }

  if (!isObject(payload) || typeof payload.exp !== 'number') return undefined;
  if (!Number.isFinite(payload.exp)) return undefined;
  return new Date(payload.exp * 1000);
}

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  let output = '';
  let buffer = 0;
  let bits = 0;

  for (const char of base64) {
    if (char === '=') break;
    const index = BASE64_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid base64url character');
    }
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }

  return output;
}

function isObject(value: unknown): value is { readonly exp?: unknown } {
  return typeof value === 'object' && value !== null;
}

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
