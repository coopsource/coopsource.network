import { describe, it, expect, beforeAll } from 'vitest';
import { P256Keypair } from '@atproto/crypto';
import { InlayAuthVerifier } from '../src/atproto/inlay-auth-verifier.js';
import type { DidResolver } from '../src/atproto/inlay-auth-verifier.js';
import type { DidDocument } from '../src/types.js';
import type { DID } from '@coopsource/common';

/** Mint a viewer JWT (as a viewer's PDS would). */
async function mintViewerJwt(opts: {
  keypair: P256Keypair;
  iss: string;
  aud: string;
  lxm: string;
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

  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${h}.${p}`;
  const sig = await opts.keypair.sign(new TextEncoder().encode(signingInput));
  return `${signingInput}.${Buffer.from(sig).toString('base64url')}`;
}

describe('InlayAuthVerifier', () => {
  const audienceDid = 'did:web:coopsource.network';
  const lxm = 'network.coopsource.inlay.MembershipStatus';

  // Two distinct viewer keypairs — proves any DID is accepted (no whitelist)
  let viewerAKeypair: P256Keypair;
  let viewerBKeypair: P256Keypair;
  const viewerADid = 'did:plc:viewer-alice';
  const viewerBDid = 'did:plc:viewer-bob';

  let verifier: InlayAuthVerifier;

  beforeAll(async () => {
    viewerAKeypair = await P256Keypair.create({ exportable: true });
    viewerBKeypair = await P256Keypair.create({ exportable: true });

    const mockResolver: DidResolver = {
      resolve: async (did: string): Promise<DidDocument> => {
        const keypairMap: Record<string, P256Keypair> = {
          [viewerADid]: viewerAKeypair,
          [viewerBDid]: viewerBKeypair,
        };
        const kp = keypairMap[did];
        if (!kp) throw new Error(`Unknown DID: ${did}`);

        const publicKeyMultibase = kp.did().slice('did:key:'.length);
        return {
          '@context': ['https://www.w3.org/ns/did/v1'],
          id: did as DID,
          verificationMethod: [{
            id: `${did}#atproto`,
            type: 'Multikey',
            controller: did,
            publicKeyMultibase,
          }],
          service: [],
        };
      },
    };

    verifier = new InlayAuthVerifier(mockResolver, audienceDid);
  });

  describe('accepts any valid DID (no whitelist)', () => {
    it('verifies a JWT from viewer A', async () => {
      const token = await mintViewerJwt({
        keypair: viewerAKeypair, iss: viewerADid, aud: audienceDid, lxm,
      });
      const result = await verifier.verify(token, lxm);
      expect(result.viewerDid).toBe(viewerADid);
      expect(result.lxm).toBe(lxm);
    });

    it('verifies a JWT from viewer B (different DID, no pre-registration)', async () => {
      const token = await mintViewerJwt({
        keypair: viewerBKeypair, iss: viewerBDid, aud: audienceDid, lxm,
      });
      const result = await verifier.verify(token, lxm);
      expect(result.viewerDid).toBe(viewerBDid);
    });
  });

  describe('claim validation', () => {
    it('rejects an expired JWT', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await mintViewerJwt({
        keypair: viewerAKeypair, iss: viewerADid, aud: audienceDid, lxm,
        exp: now - 60,
      });
      await expect(verifier.verify(token, lxm)).rejects.toThrow('JWT expired');
    });

    it('rejects a JWT with wrong audience', async () => {
      const token = await mintViewerJwt({
        keypair: viewerAKeypair, iss: viewerADid,
        aud: 'did:web:wrong.example.com', lxm,
      });
      await expect(verifier.verify(token, lxm)).rejects.toThrow('JWT audience mismatch');
    });

    it('rejects a JWT bound to a different component NSID', async () => {
      const token = await mintViewerJwt({
        keypair: viewerAKeypair, iss: viewerADid, aud: audienceDid,
        lxm: 'network.coopsource.inlay.VoteWidget',
      });
      await expect(verifier.verify(token, lxm)).rejects.toThrow('JWT method mismatch');
    });

    it('rejects a JWT with iat in the future beyond skew', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await mintViewerJwt({
        keypair: viewerAKeypair, iss: viewerADid, aud: audienceDid, lxm,
        iat: now + 120, exp: now + 180,
      });
      await expect(verifier.verify(token, lxm)).rejects.toThrow('iat is in the future');
    });
  });

  describe('signature verification', () => {
    it('rejects a tampered payload', async () => {
      const token = await mintViewerJwt({
        keypair: viewerAKeypair, iss: viewerADid, aud: audienceDid, lxm,
      });
      const [header, , signature] = token.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({
        iss: viewerADid, aud: audienceDid, lxm,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      })).toString('base64url');
      const tampered = `${header}.${tamperedPayload}.${signature}`;
      await expect(verifier.verify(tampered, lxm)).rejects.toThrow('signature verification failed');
    });

    it('rejects a JWT signed with a different key', async () => {
      // Viewer A's DID but signed with viewer B's key
      const token = await mintViewerJwt({
        keypair: viewerBKeypair, iss: viewerADid, aud: audienceDid, lxm,
      });
      await expect(verifier.verify(token, lxm)).rejects.toThrow('signature verification failed');
    });
  });

  describe('malformed tokens', () => {
    it('rejects a non-JWT string', async () => {
      await expect(verifier.verify('not-a-jwt', lxm)).rejects.toThrow('Malformed JWT');
    });

    it('rejects a JWT with wrong algorithm', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        iss: viewerADid, aud: audienceDid, lxm,
        exp: Math.floor(Date.now() / 1000) + 60,
      })).toString('base64url');
      const token = `${header}.${payload}.fakesig`;
      await expect(verifier.verify(token, lxm)).rejects.toThrow('Unsupported JWT');
    });
  });
});
