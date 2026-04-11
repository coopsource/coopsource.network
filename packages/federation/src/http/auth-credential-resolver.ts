import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { decryptKey } from '../local/did-manager.js';

/**
 * The `credential_type` string used for app passwords stored for
 * cooperative accounts. Kept as a single exported constant so the
 * provisioning writer and the resolver agree on the string.
 */
export const ATPROTO_APP_PASSWORD_CREDENTIAL_TYPE = 'atproto-app-password';

/**
 * Resolves stored ATProto app passwords for cooperative DIDs from the
 * `auth_credential` table.
 *
 * This is the V9.1 Path B primitive: `AtprotoPdsService.authFor(did, lxm)`
 * calls `resolveAppPassword(did)` to get a plaintext app password, which
 * it then passes to `AtpAgent.login({identifier: did, password})` to open
 * a session-bearing agent for cooperative repo writes. App passwords are
 * the atproto-native credential for "a third-party service holds scoped,
 * revocable credentials to act on behalf of an account" — verified
 * against `@atproto/pds` main (0.4.218) which accepts session Bearer
 * tokens (from `agent.login`) for `com.atproto.repo.*` but not
 * service-auth JWTs.
 *
 * The `secret_hash` column in `auth_credential` is reused to hold the
 * encrypted app password ciphertext (not a one-way hash — the column name
 * predates this use case). Decryption uses the same `KEY_ENC_KEY` the rest
 * of the federation package uses for encrypted-at-rest secrets.
 *
 * Throws when no matching non-invalidated row exists — same fallback
 * signal as `SigningKeyResolver.resolveRawBytes`.
 */
export class AuthCredentialResolver {
  constructor(
    private db: Kysely<Database>,
    private keyEncKey: string,
  ) {}

  /**
   * Look up and decrypt the active app password for a cooperative DID.
   *
   * Selects the most recent non-invalidated `atproto-app-password` row for
   * `entityDid` and decrypts its `secret_hash` value using `KEY_ENC_KEY`.
   * Throws if no row matches or the decrypted plaintext is empty — callers
   * (primarily `AtprotoPdsService.authFor`) use the throw as the "fall
   * through to the next auth path" signal.
   *
   * The decrypted bytes are returned as a plain string and are expected to
   * be held only inside the caller's `AtpAgent` session (via
   * `agent.login`). No long-lived plaintext storage is expected on the
   * caller side.
   */
  async resolveAppPassword(entityDid: string): Promise<string> {
    const row = await this.db
      .selectFrom('auth_credential')
      .where('entity_did', '=', entityDid)
      .where('credential_type', '=', ATPROTO_APP_PASSWORD_CREDENTIAL_TYPE)
      .where('invalidated_at', 'is', null)
      .orderBy('created_at', 'desc')
      .select(['secret_hash'])
      .executeTakeFirst();

    if (!row || !row.secret_hash) {
      throw new Error(`No atproto-app-password credential found for ${entityDid}`);
    }

    const plaintext = await decryptKey(row.secret_hash, this.keyEncKey);
    if (!plaintext) {
      throw new Error(
        `Decrypted app password for ${entityDid} is empty — credential row is corrupt`,
      );
    }
    return plaintext;
  }
}
