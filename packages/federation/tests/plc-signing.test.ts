import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import {
  signPlcOperation,
  generateRotationKeypair,
  k256PrivateKeyToPublicMultibase,
  type UnsignedPlcOperation,
} from '../src/local/plc-signing.js';

function makeUnsignedOp(overrides?: Partial<UnsignedPlcOperation>): UnsignedPlcOperation {
  return {
    type: 'plc_operation',
    rotationKeys: ['zTestRotationKey'],
    verificationMethods: { atproto: 'zTestSigningKey' },
    alsoKnownAs: ['at://test.coop'],
    services: {
      atproto_pds: {
        type: 'AtprotoPersonalDataServer',
        endpoint: 'https://pds.test.coop',
      },
    },
    prev: null,
    ...overrides,
  };
}

describe('PLC Operation Signing', () => {
  describe('signPlcOperation (P-256)', () => {
    it('should produce a signed operation with a sig field', async () => {
      const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign', 'verify'],
      );

      const op = makeUnsignedOp();
      const signed = await signPlcOperation(op, keyPair.privateKey);

      expect(signed.sig).toBeDefined();
      expect(typeof signed.sig).toBe('string');
      expect(signed.sig.length).toBeGreaterThan(0);
      // Base64url: no +, /, or = characters
      expect(signed.sig).not.toMatch(/[+/=]/);
      // All other fields preserved
      expect(signed.type).toBe('plc_operation');
      expect(signed.prev).toBeNull();
      expect(signed.rotationKeys).toEqual(['zTestRotationKey']);
    });

    it('should produce a 64-byte signature (r || s)', async () => {
      const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign', 'verify'],
      );

      const signed = await signPlcOperation(makeUnsignedOp(), keyPair.privateKey);
      // Decode base64url to check byte length
      const sigBytes = Buffer.from(
        signed.sig.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      );
      expect(sigBytes.length).toBe(64);
    });

    it('should produce different signatures for different operations', async () => {
      const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign', 'verify'],
      );

      const sig1 = await signPlcOperation(
        makeUnsignedOp({ prev: null }),
        keyPair.privateKey,
      );
      const sig2 = await signPlcOperation(
        makeUnsignedOp({ prev: 'bafyreibase32cid' }),
        keyPair.privateKey,
      );

      expect(sig1.sig).not.toBe(sig2.sig);
    });

    it('should produce a signature verifiable with the public key', async () => {
      const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
      );

      const op = makeUnsignedOp();
      const signed = await signPlcOperation(op, keyPair.privateKey);

      // Re-encode without sig to get the original bytes
      const { encode } = await import('@ipld/dag-cbor');
      const { sig: _sig, ...unsigned } = signed;
      const opBytes = new Uint8Array(encode(unsigned));

      // Decode signature
      const sigBytes = Buffer.from(
        signed.sig.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      );

      // Verify
      const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        keyPair.publicKey,
        sigBytes,
        opBytes,
      );
      expect(valid).toBe(true);
    });
  });

  describe('generateRotationKeypair (secp256k1)', () => {
    it('should generate a keypair with hex private key and multibase public key', async () => {
      const { privateKeyHex, publicKeyMultibase } = await generateRotationKeypair();

      expect(privateKeyHex).toMatch(/^[0-9a-f]{64}$/);
      // Multibase-encoded secp256k1 public key (z prefix + base58btc)
      expect(publicKeyMultibase).toMatch(/^z[A-Za-z0-9]+$/);
    });

    it('should generate different keypairs each time', async () => {
      const kp1 = await generateRotationKeypair();
      const kp2 = await generateRotationKeypair();

      expect(kp1.privateKeyHex).not.toBe(kp2.privateKeyHex);
      expect(kp1.publicKeyMultibase).not.toBe(kp2.publicKeyMultibase);
    });
  });

  describe('k256PrivateKeyToPublicMultibase', () => {
    it('should derive the same public key from a private key', async () => {
      const { privateKeyHex, publicKeyMultibase } = await generateRotationKeypair();
      const derived = await k256PrivateKeyToPublicMultibase(privateKeyHex);

      expect(derived).toBe(publicKeyMultibase);
    });
  });
});
