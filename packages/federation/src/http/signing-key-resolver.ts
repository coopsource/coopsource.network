import type { Kysely } from 'kysely';
import type { FederationDatabase } from '../local/db-tables.js';
import { decryptKey } from '../local/did-manager.js';
import type { JwkKey } from '../local/did-manager.js';

export interface ResolvedSigningKey {
  privateKey: CryptoKey;
  publicJwk: JwkKey;
  keyId: string;
}

/**
 * Resolves signing private keys for an entity from the `entity_key` table.
 *
 * Two methods intentionally returning different key representations because
 * two consumers need them in different shapes:
 *
 * - `resolve(entityDid)` returns a WebCrypto `CryptoKey` hardcoded to
 *   `key_purpose='signing'`. Used by `HttpFederationClient` for RFC 9421
 *   HTTP message signing (Tier 2 cross-cooperative private data exchange).
 *
 * - `resolveRawBytes(entityDid, purpose)` returns the raw 32-byte P-256
 *   private scalar as `Uint8Array`. Used by `ServiceAuthClient` to mint
 *   ATProto service-auth JWTs — `@atproto/crypto` `P256Keypair.import()`
 *   expects raw bytes, not a CryptoKey. The explicit `purpose` param lets
 *   callers target different key purposes; ATProto service-auth uses
 *   `'atproto-signing'` to stay distinct from the federation HTTP-sig key.
 *
 * The two methods share `entity_key` as the single source of truth; they
 * just read different rows and decode the same encrypted JWK into different
 * representations.
 */
export class SigningKeyResolver {
  constructor(
    private db: Kysely<FederationDatabase>,
    private keyEncKey: string,
  ) {}

  async resolve(entityDid: string): Promise<ResolvedSigningKey> {
    const keyRow = await this.db
      .selectFrom('entity_key')
      .where('entity_did', '=', entityDid)
      .where('key_purpose', '=', 'signing')
      .where('invalidated_at', 'is', null)
      .select(['public_key_jwk', 'private_key_enc'])
      .executeTakeFirst();

    if (!keyRow) {
      throw new Error(`No signing key found for ${entityDid}`);
    }

    const privateJwkStr = await decryptKey(keyRow.private_key_enc, this.keyEncKey);
    const privateJwk = JSON.parse(privateJwkStr) as JwkKey;
    const publicJwk = JSON.parse(keyRow.public_key_jwk) as JwkKey;

    const privateKey = await crypto.subtle.importKey(
      'jwk',
      privateJwk as Record<string, unknown>,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );

    return {
      privateKey,
      publicJwk,
      keyId: `${entityDid}#signingKey`,
    };
  }

  /**
   * Resolve the raw 32-byte P-256 private scalar for an entity's key with the
   * given purpose. Throws when no matching row exists — the throw is the
   * fallback signal for `AtprotoPdsService.authFor()`, which uses it to
   * decide whether to mint a service-auth JWT (key found) or fall back to
   * admin Basic auth (key missing).
   *
   * The returned bytes are in the shape `@atproto/crypto`
   * `P256Keypair.import()` expects: the JWK's `d` field decoded from
   * base64url, which is exactly the 32-byte private scalar.
   */
  async resolveRawBytes(
    entityDid: string,
    purpose: string,
  ): Promise<Uint8Array> {
    const keyRow = await this.db
      .selectFrom('entity_key')
      .where('entity_did', '=', entityDid)
      .where('key_purpose', '=', purpose)
      .where('invalidated_at', 'is', null)
      .select(['private_key_enc'])
      .executeTakeFirst();

    if (!keyRow) {
      throw new Error(
        `No ${purpose} key found for ${entityDid}`,
      );
    }

    const privateJwkStr = await decryptKey(
      keyRow.private_key_enc,
      this.keyEncKey,
    );
    const privateJwk = JSON.parse(privateJwkStr) as JwkKey;

    if (!privateJwk.d) {
      throw new Error(
        `${purpose} key for ${entityDid} is missing the private scalar (JWK 'd' field)`,
      );
    }

    // JWK 'd' is base64url-encoded 32 raw bytes for P-256 — exactly what
    // P256Keypair.import() accepts. No further conversion needed.
    return new Uint8Array(Buffer.from(privateJwk.d, 'base64url'));
  }
}
