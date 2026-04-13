import { describe, it, expect, beforeAll } from 'vitest';
import { P256Keypair } from '@atproto/crypto';
import { ServiceAuthVerifier } from '../src/atproto/service-auth-verifier.js';
import type { DidResolver } from '../src/atproto/service-auth-verifier.js';
import type { DidDocument } from '../src/types.js';
import type { DID } from '@coopsource/common';

/** Mint a service-auth JWT for testing. */
async function mintJwt(opts: {
  keypair: P256Keypair;
  iss: string;
  aud: string;
  lxm: string;
  sub?: string;
  exp?: number;
  iat?: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', typ: 'JWT' };
  const payload: Record<string, unknown> = {
    iss: opts.iss,
    aud: opts.aud,
    lxm: opts.lxm,
    exp: opts.exp ?? now + 60,
    iat: opts.iat ?? now,
    jti: crypto.randomUUID(),
  };
  if (opts.sub !== undefined) {
    payload.sub = opts.sub;
  }

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const sig = await opts.keypair.sign(new TextEncoder().encode(signingInput));
  return `${signingInput}.${Buffer.from(sig).toString('base64url')}`;
}

describe('ServiceAuthVerifier', () => {
  const issuerDid = 'did:plc:externalapp123';
  const audienceDid = 'did:web:coopsource.network';
  const lxm = 'network.coopsource.org.getCooperative';
  const userDid = 'did:plc:someuser456';

  let keypair: P256Keypair;
  let verifier: ServiceAuthVerifier;
  let mockResolver: DidResolver;

  beforeAll(async () => {
    keypair = await P256Keypair.create({ exportable: true });

    // Build a mock DID resolver that returns a DID document with the keypair's
    // public key as the #atproto verification method.
    const didKeyStr = keypair.did(); // did:key:z...
    // Extract the multibase value from the did:key (everything after "did:key:")
    const publicKeyMultibase = didKeyStr.slice('did:key:'.length);

    mockResolver = {
      resolve: async (did: string): Promise<DidDocument> => {
        if (did === issuerDid) {
          return {
            '@context': ['https://www.w3.org/ns/did/v1'],
            id: issuerDid as DID,
            verificationMethod: [
              {
                id: `${issuerDid}#atproto`,
                type: 'Multikey',
                controller: issuerDid,
                publicKeyMultibase,
              },
            ],
            service: [],
          };
        }
        throw new Error(`Unknown DID: ${did}`);
      },
    };

    verifier = new ServiceAuthVerifier(
      mockResolver,
      audienceDid,
      new Set([issuerDid]),
    );
  });

  describe('valid tokens', () => {
    it('verifies a valid service-auth JWT', async () => {
      const token = await mintJwt({ keypair, iss: issuerDid, aud: audienceDid, lxm });
      const result = await verifier.verify(token, lxm);
      expect(result.iss).toBe(issuerDid);
      expect(result.lxm).toBe(lxm);
      expect(result.sub).toBeUndefined();
    });

    it('returns sub when present in JWT', async () => {
      const token = await mintJwt({
        keypair, iss: issuerDid, aud: audienceDid, lxm, sub: userDid,
      });
      const result = await verifier.verify(token, lxm);
      expect(result.iss).toBe(issuerDid);
      expect(result.sub).toBe(userDid);
    });

    it('accepts tokens within 30s clock skew window', async () => {
      const now = Math.floor(Date.now() / 1000);
      // Token expired 25 seconds ago — within 30s tolerance
      const token = await mintJwt({
        keypair, iss: issuerDid, aud: audienceDid, lxm,
        exp: now - 25,
      });
      const result = await verifier.verify(token, lxm);
      expect(result.iss).toBe(issuerDid);
    });
  });

  describe('expired tokens', () => {
    it('rejects a token expired beyond clock skew tolerance', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await mintJwt({
        keypair, iss: issuerDid, aud: audienceDid, lxm,
        exp: now - 60,
      });
      await expect(verifier.verify(token, lxm)).rejects.toThrow('JWT expired');
    });
  });

  describe('audience mismatch', () => {
    it('rejects a token with wrong audience', async () => {
      const token = await mintJwt({
        keypair, iss: issuerDid, aud: 'did:web:wrong.example.com', lxm,
      });
      await expect(verifier.verify(token, lxm)).rejects.toThrow('JWT audience mismatch');
    });
  });

  describe('method mismatch', () => {
    it('rejects a token bound to a different XRPC method', async () => {
      const token = await mintJwt({
        keypair, iss: issuerDid, aud: audienceDid,
        lxm: 'network.coopsource.governance.listProposals',
      });
      await expect(verifier.verify(token, lxm)).rejects.toThrow('JWT method mismatch');
    });
  });

  describe('untrusted issuer', () => {
    it('rejects a token from an unknown issuer DID', async () => {
      const untrustedKeypair = await P256Keypair.create({ exportable: true });
      const untrustedDid = 'did:plc:untrusted999';

      // Create a verifier that only trusts the original issuer
      const token = await mintJwt({
        keypair: untrustedKeypair, iss: untrustedDid, aud: audienceDid, lxm,
      });
      await expect(verifier.verify(token, lxm)).rejects.toThrow('Untrusted JWT issuer');
    });
  });

  describe('tampered tokens', () => {
    it('rejects a token with a modified payload', async () => {
      const token = await mintJwt({ keypair, iss: issuerDid, aud: audienceDid, lxm });
      const [header, , signature] = token.split('.');
      // Replace payload with a tampered one
      const tamperedPayload = Buffer.from(JSON.stringify({
        iss: issuerDid, aud: audienceDid, lxm,
        exp: Math.floor(Date.now() / 1000) + 3600, // extended expiry
        iat: Math.floor(Date.now() / 1000),
      })).toString('base64url');
      const tampered = `${header}.${tamperedPayload}.${signature}`;
      await expect(verifier.verify(tampered, lxm)).rejects.toThrow('signature verification failed');
    });

    it('rejects a token signed with a different key', async () => {
      const otherKeypair = await P256Keypair.create({ exportable: true });
      const token = await mintJwt({
        keypair: otherKeypair, iss: issuerDid, aud: audienceDid, lxm,
      });
      // The verifier resolves issuerDid → original keypair's public key,
      // but the token was signed with otherKeypair → signature mismatch
      await expect(verifier.verify(token, lxm)).rejects.toThrow('signature verification failed');
    });
  });

  describe('malformed tokens', () => {
    it('rejects a non-JWT string', async () => {
      await expect(verifier.verify('not-a-jwt', lxm)).rejects.toThrow('Malformed JWT');
    });

    it('rejects a token with wrong algorithm', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        iss: issuerDid, aud: audienceDid, lxm,
        exp: Math.floor(Date.now() / 1000) + 60,
      })).toString('base64url');
      const token = `${header}.${payload}.fakesig`;
      await expect(verifier.verify(token, lxm)).rejects.toThrow('Unsupported JWT');
    });

    it('rejects a token with non-DID sub', async () => {
      const token = await mintJwt({
        keypair, iss: issuerDid, aud: audienceDid, lxm,
      });
      // Manually construct a token with a non-DID sub
      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        iss: issuerDid, aud: audienceDid, lxm,
        exp: now + 60, iat: now, sub: 'not-a-did',
      })).toString('base64url');
      const signingInput = `${header}.${payload}`;
      const sig = await keypair.sign(new TextEncoder().encode(signingInput));
      const badToken = `${signingInput}.${Buffer.from(sig).toString('base64url')}`;
      await expect(verifier.verify(badToken, lxm)).rejects.toThrow('sub must be a DID');
    });

    it('rejects a token with iat in the future beyond skew', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await mintJwt({
        keypair, iss: issuerDid, aud: audienceDid, lxm,
        iat: now + 120, exp: now + 180,
      });
      await expect(verifier.verify(token, lxm)).rejects.toThrow('iat is in the future');
    });
  });
});
