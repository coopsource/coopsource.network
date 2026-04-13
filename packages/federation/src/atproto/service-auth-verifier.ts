import { verifySignature } from '@atproto/crypto';
import type { DidDocument } from '../types.js';

export interface ServiceAuthResult {
  /** DID of the calling service (JWT issuer). */
  iss: string;
  /** DID of the user the calling service is acting on behalf of (may be undefined). */
  sub?: string;
  /** XRPC method the token is bound to. */
  lxm: string;
}

export interface DidResolver {
  resolve(did: string): Promise<DidDocument>;
}

/**
 * Verifies incoming ATProto service-auth JWTs from external applications.
 *
 * Follows the Roomy/OpenMeet pattern: a trusted external ATProto service signs
 * a short-lived JWT with its own signing key. CSN verifies the signature against
 * the issuer's DID document, checks the audience and method binding, and returns
 * the verified claims.
 *
 * Server-to-server only — browser-side Inlay widgets cannot sign JWTs.
 */
export class ServiceAuthVerifier {
  private static readonly CLOCK_SKEW_SECONDS = 30;

  constructor(
    private readonly didResolver: DidResolver,
    private readonly audienceDid: string,
    private readonly trustedIssuers: ReadonlySet<string>,
  ) {}

  /**
   * Verify a service-auth JWT.
   *
   * @param token - The raw JWT string (from `Authorization: Bearer <token>`)
   * @param expectedLxm - The XRPC method the caller is invoking
   * @returns Verified claims on success
   * @throws Error with descriptive message on any verification failure
   */
  async verify(token: string, expectedLxm: string): Promise<ServiceAuthResult> {
    // 1. Parse JWT structure
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Malformed JWT: expected three dot-separated segments');
    }
    const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];

    const header = parseBase64UrlJson(encodedHeader);
    if (header.alg !== 'ES256' || header.typ !== 'JWT') {
      throw new Error(`Unsupported JWT: expected alg=ES256 typ=JWT, got alg=${header.alg} typ=${header.typ}`);
    }

    const payload = parseBase64UrlJson(encodedPayload);

    // 2. Validate claims
    const { iss, aud, exp, iat, lxm, sub } = payload;

    if (typeof iss !== 'string' || !iss.startsWith('did:')) {
      throw new Error('Invalid JWT: iss must be a DID');
    }
    if (typeof aud !== 'string') {
      throw new Error('Invalid JWT: missing aud claim');
    }
    if (typeof exp !== 'number') {
      throw new Error('Invalid JWT: missing or non-numeric exp claim');
    }
    if (typeof lxm !== 'string') {
      throw new Error('Invalid JWT: missing lxm claim');
    }

    // Check audience
    if (aud !== this.audienceDid) {
      throw new Error(`JWT audience mismatch: expected ${this.audienceDid}, got ${aud}`);
    }

    // Check method binding
    if (lxm !== expectedLxm) {
      throw new Error(`JWT method mismatch: expected ${expectedLxm}, got ${lxm}`);
    }

    // Check expiration (with clock skew tolerance)
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds > exp + ServiceAuthVerifier.CLOCK_SKEW_SECONDS) {
      throw new Error('JWT expired');
    }

    // Check iat is not in the future (with clock skew tolerance)
    if (typeof iat === 'number' && iat > nowSeconds + ServiceAuthVerifier.CLOCK_SKEW_SECONDS) {
      throw new Error('JWT iat is in the future');
    }

    // Check sub is a DID if present
    if (sub !== undefined && (typeof sub !== 'string' || !sub.startsWith('did:'))) {
      throw new Error('Invalid JWT: sub must be a DID when present');
    }

    // 3. Check trusted issuers
    if (!this.trustedIssuers.has(iss)) {
      throw new Error(`Untrusted JWT issuer: ${iss}`);
    }

    // 4. Resolve issuer's DID document and extract signing key
    const didDoc = await this.didResolver.resolve(iss);
    const didKey = extractAtprotoDidKey(didDoc);

    // 5. Verify ES256 signature
    const signingInput = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
    const signatureBytes = new Uint8Array(Buffer.from(encodedSignature, 'base64url'));

    const valid = await verifySignature(didKey, signingInput, signatureBytes);
    if (!valid) {
      throw new Error('JWT signature verification failed');
    }

    return { iss, sub, lxm };
  }
}

/**
 * Extract the `#atproto` verification method from a resolved DID document
 * and return it as a `did:key:z...` string suitable for `verifySignature`.
 *
 * Resolved DID documents (from plc.directory or did:web) use
 * `verificationMethod[].publicKeyMultibase`, not the PLC operation format
 * `verificationMethods.atproto`.
 */
function extractAtprotoDidKey(didDoc: DidDocument): string {
  // Look for the #atproto verification method (standard ATProto convention)
  const vm = didDoc.verificationMethod.find(
    (m) => m.id === `${didDoc.id}#atproto` || m.id === '#atproto',
  );
  if (!vm) {
    throw new Error(`No #atproto verification method in DID document for ${didDoc.id}`);
  }

  if (!vm.publicKeyMultibase) {
    throw new Error(`Verification method #atproto has no publicKeyMultibase for ${didDoc.id}`);
  }

  // publicKeyMultibase is 'z' + base58btc(multicodec_prefix + compressed_point)
  // Reconstruct the did:key from the multibase value
  return `did:key:${vm.publicKeyMultibase}`;
}

function parseBase64UrlJson(encoded: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Malformed JWT: failed to decode base64url JSON segment');
  }
}
