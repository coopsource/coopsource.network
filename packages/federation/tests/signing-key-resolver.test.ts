import { describe, it, expect, beforeEach } from 'vitest';
import type { Kysely } from 'kysely';
import { P256Keypair, verifySignature } from '@atproto/crypto';
import { SigningKeyResolver } from '../src/http/signing-key-resolver.js';
import type { FederationDatabase } from '../src/local/db-tables.js';
import { encryptKey, generateKeyPair } from '../src/local/did-manager.js';

/**
 * Minimal fake Kysely that returns predefined rows from a map keyed by
 * `(entity_did, key_purpose)`. Enough to exercise `SigningKeyResolver` end
 * to end without spinning up a real Postgres. All the interesting logic
 * (decryption, JWK decoding, 'd' extraction) runs against real data.
 */
interface StoredKey {
  entity_did: string;
  key_purpose: string;
  private_key_enc: string;
  public_key_jwk: string;
}

function createFakeDb(rows: StoredKey[]): Kysely<FederationDatabase> {
  const builder = {
    _did: null as string | null,
    _purpose: null as string | null,
    where(
      this: typeof builder,
      column: string,
      _op: string,
      value: unknown,
    ): typeof builder {
      if (column === 'entity_did') this._did = value as string;
      if (column === 'key_purpose') this._purpose = value as string;
      return this;
    },
    select(
      this: typeof builder,
      _cols: readonly string[],
    ): typeof builder {
      return this;
    },
    async executeTakeFirst(this: typeof builder): Promise<StoredKey | undefined> {
      return rows.find(
        (r) => r.entity_did === this._did && r.key_purpose === this._purpose,
      );
    },
  };
  const fake = {
    selectFrom(_table: string) {
      // Return a fresh builder so queries don't share state.
      return { ...builder, _did: null, _purpose: null };
    },
  } as unknown as Kysely<FederationDatabase>;
  return fake;
}

// Key encryption key — 32 random bytes as base64. Matches the shape used by
// apps/api/src/container.ts in production.
const keyEncKey = Buffer.alloc(32, 7).toString('base64');

describe('SigningKeyResolver.resolveRawBytes', () => {
  const entityDid = 'did:plc:cooperative-example';

  let resolver: SigningKeyResolver;
  let fixturePrivateKeyBytes: Uint8Array;
  let fixtureJwkD: string;

  beforeEach(async () => {
    // Generate a real P-256 key, encrypt it, and stuff it into the fake DB
    // with key_purpose='atproto-signing'. The resolver's job is to get us
    // back the exact 32-byte scalar we started with.
    const { privateJwk, publicJwk } = await generateKeyPair();
    fixtureJwkD = privateJwk.d!;
    fixturePrivateKeyBytes = new Uint8Array(Buffer.from(fixtureJwkD, 'base64url'));

    const privateJwkStr = JSON.stringify(privateJwk);
    const encrypted = await encryptKey(privateJwkStr, keyEncKey);

    const db = createFakeDb([
      {
        entity_did: entityDid,
        key_purpose: 'atproto-signing',
        private_key_enc: encrypted,
        public_key_jwk: JSON.stringify(publicJwk),
      },
    ]);
    resolver = new SigningKeyResolver(db, keyEncKey);
  });

  it('returns the 32-byte private scalar for the matching purpose', async () => {
    const bytes = await resolver.resolveRawBytes(entityDid, 'atproto-signing');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(32);
    expect(Array.from(bytes)).toEqual(Array.from(fixturePrivateKeyBytes));
  });

  it('throws when no row matches the entity DID', async () => {
    await expect(
      resolver.resolveRawBytes('did:plc:unknown', 'atproto-signing'),
    ).rejects.toThrow('No atproto-signing key found for did:plc:unknown');
  });

  it('throws when no row matches the purpose', async () => {
    await expect(
      resolver.resolveRawBytes(entityDid, 'some-other-purpose'),
    ).rejects.toThrow(
      `No some-other-purpose key found for ${entityDid}`,
    );
  });

  it('returned bytes round-trip through P256Keypair.import() and produce a verifying signature', async () => {
    const bytes = await resolver.resolveRawBytes(entityDid, 'atproto-signing');
    const keypair = await P256Keypair.import(bytes);

    const msg = new TextEncoder().encode('round-trip test message');
    const sig = await keypair.sign(msg);

    // Uses the same did:key the audience PDS would derive from the issuer's
    // DID document — if verifySignature returns true here, it will return
    // true at the PDS too (modulo differences in how the PDS reads the JWK
    // from the PLC directory, which is out of scope for this unit test).
    const valid = await verifySignature(keypair.did(), msg, sig);
    expect(valid).toBe(true);
  });

  it('throws when the stored JWK lacks the private scalar', async () => {
    // Simulate a corrupt row — encrypted JWK with no `d` field. This path is
    // defensive; shouldn't happen in practice, but if it does we want a clear
    // error rather than a weird downstream crash in P256Keypair.import().
    const { publicJwk } = await generateKeyPair();
    // Note: {...publicJwk} has no `d` (public JWK only) — use it as the
    // "private" input to force the missing-d branch.
    const corruptEncrypted = await encryptKey(
      JSON.stringify(publicJwk),
      keyEncKey,
    );
    const corruptDb = createFakeDb([
      {
        entity_did: entityDid,
        key_purpose: 'atproto-signing',
        private_key_enc: corruptEncrypted,
        public_key_jwk: JSON.stringify(publicJwk),
      },
    ]);
    const corruptResolver = new SigningKeyResolver(corruptDb, keyEncKey);

    await expect(
      corruptResolver.resolveRawBytes(entityDid, 'atproto-signing'),
    ).rejects.toThrow(/missing the private scalar/);
  });
});

describe('SigningKeyResolver.resolve (existing HTTP-sig path unchanged)', () => {
  it('still hardcodes key_purpose="signing" and returns a CryptoKey', async () => {
    const entityDid = 'did:plc:cooperative-example';
    const { privateJwk, publicJwk } = await generateKeyPair();
    const privateJwkStr = JSON.stringify(privateJwk);
    const encrypted = await encryptKey(privateJwkStr, keyEncKey);

    const db = createFakeDb([
      {
        entity_did: entityDid,
        key_purpose: 'signing',
        private_key_enc: encrypted,
        public_key_jwk: JSON.stringify(publicJwk),
      },
    ]);
    const resolver = new SigningKeyResolver(db, keyEncKey);

    const result = await resolver.resolve(entityDid);
    expect(result.keyId).toBe(`${entityDid}#signingKey`);
    expect(result.publicJwk).toMatchObject({ kty: 'EC', crv: 'P-256' });
    // Regression guard: the existing method should NOT pick up a key stored
    // with a different purpose.
    const emptyDb = createFakeDb([
      {
        entity_did: entityDid,
        key_purpose: 'atproto-signing',
        private_key_enc: encrypted,
        public_key_jwk: JSON.stringify(publicJwk),
      },
    ]);
    const emptyResolver = new SigningKeyResolver(emptyDb, keyEncKey);
    await expect(emptyResolver.resolve(entityDid)).rejects.toThrow(
      'No signing key found',
    );
  });
});
