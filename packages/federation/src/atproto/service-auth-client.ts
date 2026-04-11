import { randomUUID } from 'node:crypto';
import { P256Keypair } from '@atproto/crypto';

/**
 * Parameters for minting a service-auth JWT.
 *
 * The issuer, audience, and method are bound into the token; the signing key
 * is the raw 32-byte ES256 private scalar, which must correspond to the
 * ATProto signing key the issuer advertises in their DID document
 * (`verificationMethods.atproto`) — otherwise the audience service will reject
 * the token.
 */
export interface CreateServiceAuthParams {
  /** DID of the entity issuing the JWT (the repo owner for write operations). */
  issuerDid: string;
  /** DID of the target service the token authenticates to (typically the PDS). */
  audienceDid: string;
  /** XRPC method the token is bound to (e.g. `com.atproto.repo.createRecord`). */
  lxm: string;
  /**
   * Raw 32-byte P-256 private scalar (JWK `d` field, base64url-decoded).
   * Matches the input shape `P256Keypair.import()` expects.
   */
  signingKey: Uint8Array;
}

/**
 * Mints short-lived ATProto service-auth JWTs for cross-service XRPC calls.
 *
 * The token follows the standard JWT format:
 *   header  = {alg:'ES256', typ:'JWT'}
 *   payload = {iss, aud, exp, iat, jti, lxm}
 *
 * Tokens are signed locally with `@atproto/crypto` `P256Keypair.sign()`, which
 * returns a raw 64-byte r||s signature — exactly what ES256 JWT encoding wants
 * (no DER conversion). Tokens are minted per operation and must never be
 * cached; the 60-second expiration and unique `jti` enforce that callers
 * always mint fresh tokens.
 *
 * This class is pure — no I/O, no DI, no state. All inputs are passed in; the
 * only side effect is computing a signature.
 */
export class ServiceAuthClient {
  /**
   * Default lifetime of a service-auth JWT in seconds. Kept low (60s) per the
   * security requirements in ARCHITECTURE-V9.md §2 — service-auth JWTs must
   * not be long-lived, and the method binding (`lxm`) already prevents scope
   * escalation within that window.
   */
  private static readonly DEFAULT_LIFETIME_SECONDS = 60;

  /**
   * Construct and sign a new service-auth JWT.
   *
   * Each invocation mints a fresh token with a unique `jti` and a 60-second
   * `exp` relative to now. The same params passed twice will produce two
   * distinct tokens — tokens must not be cached or reused.
   */
  async createServiceAuth(params: CreateServiceAuthParams): Promise<string> {
    const { issuerDid, audienceDid, lxm, signingKey } = params;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const header = { alg: 'ES256', typ: 'JWT' };
    const payload = {
      iss: issuerDid,
      aud: audienceDid,
      exp: nowSeconds + ServiceAuthClient.DEFAULT_LIFETIME_SECONDS,
      iat: nowSeconds,
      jti: randomUUID(),
      lxm,
    };

    const encodedHeader = base64UrlEncodeJson(header);
    const encodedPayload = base64UrlEncodeJson(payload);
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const keypair = await P256Keypair.import(signingKey);
    const signatureBytes = await keypair.sign(
      new TextEncoder().encode(signingInput),
    );
    const encodedSignature = base64UrlEncode(signatureBytes);

    return `${signingInput}.${encodedSignature}`;
  }
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncode(Buffer.from(JSON.stringify(value), 'utf8'));
}

function base64UrlEncode(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes).toString('base64url');
}
