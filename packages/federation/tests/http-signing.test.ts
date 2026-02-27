import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import * as crypto from 'node:crypto';
import { signRequest, verifyRequest, createContentDigest, verifyContentDigest } from '../src/http/signing.js';
import type { DidDocument } from '../src/types.js';
import type { DID } from '@coopsource/common';
import { DidWebResolver } from '../src/http/did-web-resolver.js';

describe('HTTP Message Signatures', () => {
  let privateKey: CryptoKey;
  let publicKey: CryptoKey;
  let publicJwk: Record<string, unknown>;
  const keyId = 'did:web:coop-a.example.com#signingKey';
  const signerDid = 'did:web:coop-a.example.com';

  beforeAll(async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    privateKey = keyPair.privateKey;
    publicKey = keyPair.publicKey;
    publicJwk = (await crypto.subtle.exportKey('jwk', publicKey)) as Record<string, unknown>;
  });

  function createMockDidResolver(jwk: Record<string, unknown>): DidWebResolver {
    const resolver = new DidWebResolver();
    vi.spyOn(resolver, 'resolve').mockResolvedValue({
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: signerDid as DID,
      verificationMethod: [
        {
          id: keyId,
          type: 'JsonWebKey',
          controller: signerDid,
          publicKeyJwk: jwk,
        },
      ],
      service: [
        {
          id: '#coopsource',
          type: 'CoopSourcePds',
          serviceEndpoint: 'https://coop-a.example.com',
        },
      ],
    } satisfies DidDocument);
    return resolver;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('createContentDigest / verifyContentDigest', () => {
    it('creates and verifies a content digest', async () => {
      const body = '{"hello":"world"}';
      const digest = await createContentDigest(body);
      expect(digest).toMatch(/^sha-256=:.+:$/);
      expect(await verifyContentDigest(body, digest)).toBe(true);
    });

    it('fails verification with tampered body', async () => {
      const digest = await createContentDigest('{"hello":"world"}');
      expect(await verifyContentDigest('{"hello":"tampered"}', digest)).toBe(false);
    });
  });

  describe('signRequest + verifyRequest round-trip', () => {
    it('signs and verifies a POST request with body', async () => {
      const method = 'POST';
      const targetUri = 'https://hub.example.com/api/v1/federation/membership/approve';
      const body = JSON.stringify({ cooperativeDid: 'did:web:hub.example.com', memberDid: signerDid, roles: ['member'] });
      const headers: Record<string, string> = { 'content-type': 'application/json' };

      const sigHeaders = await signRequest(method, targetUri, headers, body, privateKey, keyId);

      expect(sigHeaders['Signature-Input']).toContain('keyid="did:web:coop-a.example.com#signingKey"');
      expect(sigHeaders['Signature-Input']).toContain('alg="ecdsa-p256-sha256"');
      expect(sigHeaders['Signature']).toMatch(/^sig=:.+:$/);
      expect(sigHeaders['Content-Digest']).toMatch(/^sha-256=:.+:$/);

      // Merge signing headers into the request headers
      Object.assign(headers, {
        'signature-input': sigHeaders['Signature-Input'],
        signature: sigHeaders['Signature'],
        'content-digest': sigHeaders['Content-Digest'],
      });

      const resolver = createMockDidResolver(publicJwk);
      const result = await verifyRequest(method, targetUri, headers, body, resolver);

      expect(result.verified).toBe(true);
      expect(result.signerDid).toBe(signerDid);
    });

    it('signs and verifies a GET request without body', async () => {
      const method = 'GET';
      const targetUri = 'https://hub.example.com/api/v1/federation/entity/did%3Aweb%3Acoop-a.example.com';
      const headers: Record<string, string> = {};

      const sigHeaders = await signRequest(method, targetUri, headers, null, privateKey, keyId);

      expect(sigHeaders['Content-Digest']).toBeUndefined();
      expect(sigHeaders['Signature-Input']).toBeDefined();
      expect(sigHeaders['Signature']).toBeDefined();

      Object.assign(headers, {
        'signature-input': sigHeaders['Signature-Input'],
        signature: sigHeaders['Signature'],
      });

      const resolver = createMockDidResolver(publicJwk);
      const result = await verifyRequest(method, targetUri, headers, null, resolver);

      expect(result.verified).toBe(true);
      expect(result.signerDid).toBe(signerDid);
    });

    it('fails verification with tampered body', async () => {
      const method = 'POST';
      const targetUri = 'https://hub.example.com/api/v1/federation/membership/approve';
      const body = '{"roles":["member"]}';
      const headers: Record<string, string> = { 'content-type': 'application/json' };

      const sigHeaders = await signRequest(method, targetUri, headers, body, privateKey, keyId);
      Object.assign(headers, {
        'signature-input': sigHeaders['Signature-Input'],
        signature: sigHeaders['Signature'],
        'content-digest': sigHeaders['Content-Digest'],
      });

      const resolver = createMockDidResolver(publicJwk);
      const result = await verifyRequest(method, targetUri, headers, '{"roles":["admin"]}', resolver);

      expect(result.verified).toBe(false);
    });

    it('fails verification with tampered signature', async () => {
      const method = 'POST';
      const targetUri = 'https://hub.example.com/api/test';
      const body = '{"test":true}';
      const headers: Record<string, string> = { 'content-type': 'application/json' };

      const sigHeaders = await signRequest(method, targetUri, headers, body, privateKey, keyId);
      Object.assign(headers, {
        'signature-input': sigHeaders['Signature-Input'],
        signature: 'sig=:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=:',
        'content-digest': sigHeaders['Content-Digest'],
      });

      const resolver = createMockDidResolver(publicJwk);
      const result = await verifyRequest(method, targetUri, headers, body, resolver);

      expect(result.verified).toBe(false);
    });

    it('fails verification with expired timestamp', async () => {
      const method = 'GET';
      const targetUri = 'https://hub.example.com/api/test';
      const headers: Record<string, string> = {};

      const sigHeaders = await signRequest(method, targetUri, headers, null, privateKey, keyId);

      // Tamper the created timestamp to 10 minutes ago
      const tamperedInput = sigHeaders['Signature-Input'].replace(
        /created=\d+/,
        `created=${Math.floor(Date.now() / 1000) - 600}`,
      );
      Object.assign(headers, {
        'signature-input': tamperedInput,
        signature: sigHeaders['Signature'],
      });

      const resolver = createMockDidResolver(publicJwk);
      const result = await verifyRequest(method, targetUri, headers, null, resolver);

      expect(result.verified).toBe(false);
    });

    it('fails verification with wrong key', async () => {
      const wrongKeyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
      );
      const wrongPublicJwk = (await crypto.subtle.exportKey('jwk', wrongKeyPair.publicKey)) as Record<string, unknown>;

      const method = 'GET';
      const targetUri = 'https://hub.example.com/api/test';
      const headers: Record<string, string> = {};

      const sigHeaders = await signRequest(method, targetUri, headers, null, privateKey, keyId);
      Object.assign(headers, {
        'signature-input': sigHeaders['Signature-Input'],
        signature: sigHeaders['Signature'],
      });

      const resolver = createMockDidResolver(wrongPublicJwk);
      const result = await verifyRequest(method, targetUri, headers, null, resolver);

      expect(result.verified).toBe(false);
    });

    it('fails when Signature-Input is missing', async () => {
      const resolver = createMockDidResolver(publicJwk);
      const result = await verifyRequest('GET', 'https://example.com', {}, null, resolver);
      expect(result.verified).toBe(false);
    });

    it('fails when DID resolution fails', async () => {
      const method = 'GET';
      const targetUri = 'https://hub.example.com/api/test';
      const headers: Record<string, string> = {};

      const sigHeaders = await signRequest(method, targetUri, headers, null, privateKey, keyId);
      Object.assign(headers, {
        'signature-input': sigHeaders['Signature-Input'],
        signature: sigHeaders['Signature'],
      });

      const resolver = new DidWebResolver();
      vi.spyOn(resolver, 'resolve').mockRejectedValue(new Error('DID not found'));

      const result = await verifyRequest(method, targetUri, headers, null, resolver);
      expect(result.verified).toBe(false);
    });
  });
});
