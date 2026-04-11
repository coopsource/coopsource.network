import { describe, it, expect, beforeAll } from 'vitest';
import { P256Keypair, verifySignature } from '@atproto/crypto';
import { ServiceAuthClient } from '../src/atproto/service-auth-client.js';

describe('ServiceAuthClient', () => {
  let client: ServiceAuthClient;
  let keypair: P256Keypair;
  let signingKey: Uint8Array;
  const issuerDid = 'did:plc:cooperative-example';
  const audienceDid = 'did:web:pds.example.com';
  const lxm = 'com.atproto.repo.createRecord';

  beforeAll(async () => {
    client = new ServiceAuthClient();
    // Generate an exportable keypair so we can pull the raw 32-byte scalar —
    // the same shape `resolveRawBytes()` will hand us in production.
    keypair = await P256Keypair.create({ exportable: true });
    signingKey = await keypair.export();
  });

  describe('token structure', () => {
    it('emits a three-part JWT with exactly two separators', async () => {
      const token = await client.createServiceAuth({
        issuerDid,
        audienceDid,
        lxm,
        signingKey,
      });
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
      // Each segment must be non-empty and valid base64url (no +, /, =, whitespace).
      for (const part of parts) {
        expect(part.length).toBeGreaterThan(0);
        expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    });

    it('header decodes to {alg:"ES256", typ:"JWT"}', async () => {
      const token = await client.createServiceAuth({
        issuerDid,
        audienceDid,
        lxm,
        signingKey,
      });
      const header = JSON.parse(
        Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8'),
      );
      expect(header).toEqual({ alg: 'ES256', typ: 'JWT' });
    });

    it('payload contains all required claims with correct values', async () => {
      const before = Math.floor(Date.now() / 1000);
      const token = await client.createServiceAuth({
        issuerDid,
        audienceDid,
        lxm,
        signingKey,
      });
      const after = Math.floor(Date.now() / 1000);
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'),
      );

      expect(payload.iss).toBe(issuerDid);
      expect(payload.aud).toBe(audienceDid);
      expect(payload.lxm).toBe(lxm);
      expect(typeof payload.jti).toBe('string');
      expect(payload.jti).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      // iat is clamped between the two wall-clock reads that bracket the call.
      expect(payload.iat).toBeGreaterThanOrEqual(before);
      expect(payload.iat).toBeLessThanOrEqual(after);
    });

    it('exp is exactly 60 seconds after iat', async () => {
      const token = await client.createServiceAuth({
        issuerDid,
        audienceDid,
        lxm,
        signingKey,
      });
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'),
      );
      expect(payload.exp - payload.iat).toBe(60);
    });
  });

  describe('per-operation freshness', () => {
    it('jti differs across 100 successive calls (no caching)', async () => {
      const jtis = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const token = await client.createServiceAuth({
          issuerDid,
          audienceDid,
          lxm,
          signingKey,
        });
        const payload = JSON.parse(
          Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'),
        );
        jtis.add(payload.jti);
      }
      expect(jtis.size).toBe(100);
    });

    it('two successive calls with identical params produce two distinct tokens', async () => {
      const params = { issuerDid, audienceDid, lxm, signingKey };
      const tokenA = await client.createServiceAuth(params);
      const tokenB = await client.createServiceAuth(params);
      expect(tokenA).not.toBe(tokenB);
    });
  });

  describe('signature round-trip', () => {
    it('signature verifies against the signing key via verifySignature', async () => {
      const token = await client.createServiceAuth({
        issuerDid,
        audienceDid,
        lxm,
        signingKey,
      });

      const [encodedHeader, encodedPayload, encodedSignature] = token.split(
        '.',
      );
      const signingInput = new TextEncoder().encode(
        `${encodedHeader}.${encodedPayload}`,
      );
      const signatureBytes = new Uint8Array(
        Buffer.from(encodedSignature!, 'base64url'),
      );

      // `verifySignature` takes a did:key form — use the keypair's own
      // did:key representation, which encodes the same public key the
      // audience PDS would derive from the issuer's DID document.
      const didKey = keypair.did();
      const valid = await verifySignature(didKey, signingInput, signatureBytes);
      expect(valid).toBe(true);
    });

    it('signature fails to verify against a different key', async () => {
      const token = await client.createServiceAuth({
        issuerDid,
        audienceDid,
        lxm,
        signingKey,
      });

      const [encodedHeader, encodedPayload, encodedSignature] = token.split(
        '.',
      );
      const signingInput = new TextEncoder().encode(
        `${encodedHeader}.${encodedPayload}`,
      );
      const signatureBytes = new Uint8Array(
        Buffer.from(encodedSignature!, 'base64url'),
      );

      const otherKeypair = await P256Keypair.create();
      const valid = await verifySignature(
        otherKeypair.did(),
        signingInput,
        signatureBytes,
      );
      expect(valid).toBe(false);
    });

    it('signature fails to verify against tampered payload', async () => {
      const token = await client.createServiceAuth({
        issuerDid,
        audienceDid,
        lxm,
        signingKey,
      });

      const [encodedHeader, , encodedSignature] = token.split('.');
      // Substitute a different (still valid base64url) payload — the signing
      // input changes, so the stored signature must not verify.
      const tamperedPayload = Buffer.from(
        JSON.stringify({ iss: 'did:plc:attacker' }),
        'utf8',
      ).toString('base64url');
      const tamperedInput = new TextEncoder().encode(
        `${encodedHeader}.${tamperedPayload}`,
      );
      const signatureBytes = new Uint8Array(
        Buffer.from(encodedSignature!, 'base64url'),
      );

      const valid = await verifySignature(
        keypair.did(),
        tamperedInput,
        signatureBytes,
      );
      expect(valid).toBe(false);
    });
  });
});
