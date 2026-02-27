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
 * Resolves the signing private key for an entity from the entity_key table.
 * Used by HttpFederationClient to sign outbound HTTP requests.
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
}
