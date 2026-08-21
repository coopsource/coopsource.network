import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import * as crypto from 'node:crypto';
import { signRequest, verifyRequest, createContentDigest, verifyContentDigest } from '../src/http/signing.js';
import type { DidDocument } from '../src/types.js';
import type { DID } from '@coopsource/common';
import { DidWebResolver } from '../src/http/did-web-resolver.js';
import { publicJwkToMultibase } from '../src/local/did-manager.js';

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

    it('verifies a PLC Multikey signing method', async () => {
      const plcDid = 'did:plc:testsigner';
      const plcKeyId = `${plcDid}#atproto`;
      const method = 'POST';
      const targetUri = 'https://coop-b.example.com/api/v1/federation/membership/request';
      const body = JSON.stringify({ memberDid: plcDid });
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      };
      const sigHeaders = await signRequest(
        method,
        targetUri,
        headers,
        body,
        privateKey,
        plcKeyId,
      );
      Object.assign(headers, {
        'signature-input': sigHeaders['Signature-Input'],
        signature: sigHeaders.Signature,
        'content-digest': sigHeaders['Content-Digest'],
      });

      const resolver = new DidWebResolver();
      vi.spyOn(resolver, 'resolve').mockResolvedValue({
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: plcDid as DID,
        verificationMethod: [
          {
            id: plcKeyId,
            type: 'Multikey',
            controller: plcDid,
            publicKeyMultibase: publicJwkToMultibase(publicJwk),
          },
        ],
        service: [],
      });

      const result = await verifyRequest(
        method,
        targetUri,
        headers,
        body,
        resolver,
      );

      expect(result).toEqual({ verified: true, signerDid: plcDid });
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

  describe('covered-component requirements', () => {
    const method = 'POST';
    const targetUri = 'https://hub.example.com/api/v1/federation/membership/approve';

    /**
     * Signs with an arbitrary covered-component list, mirroring the four-line
     * base construction in signRequest. Non-pseudo components fall through to a
     * header lookup exactly as buildSignatureBase does, so a sender-chosen list
     * produces a base the verifier reconstructs byte-for-byte.
     *
     * Duplicates buildSignatureBase at packages/federation/src/http/signing.ts:45 — keep in sync.
     */
    async function signWithComponents(
      components: string[],
      headers: Record<string, string>,
    ): Promise<{ 'signature-input': string; signature: string }> {
      const created = Math.floor(Date.now() / 1000);
      const signatureParams = `(${components.map((c) => `"${c}"`).join(' ')});keyid="${keyId}";alg="ecdsa-p256-sha256";created=${created}`;
      const lines = components.map((component) => {
        if (component === '@method') return `"@method": ${method.toUpperCase()}`;
        if (component === '@target-uri') return `"@target-uri": ${targetUri}`;
        return `"${component}": ${headers[component.toLowerCase()] ?? ''}`;
      });
      const base = lines.join('\n') + '\n' + `"@signature-params": ${signatureParams}`;
      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        new TextEncoder().encode(base),
      );
      return {
        'signature-input': `sig=${signatureParams}`,
        signature: `sig=:${Buffer.from(signature).toString('base64')}:`,
      };
    }

    it('does not verify a body when Signature-Input omits content-digest', async () => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };

      // Sign as if there were no body: the covered list is ("@method" "@target-uri"),
      // so nothing binds the bytes that are then delivered as the request body.
      const sigHeaders = await signRequest(method, targetUri, headers, null, privateKey, keyId);
      expect(sigHeaders['Signature-Input']).not.toContain('content-digest');
      Object.assign(headers, {
        'signature-input': sigHeaders['Signature-Input'],
        signature: sigHeaders['Signature'],
      });

      const resolver = createMockDidResolver(publicJwk);
      const result = await verifyRequest(method, targetUri, headers, '{"roles":["admin"]}', resolver);

      expect(result.verified).toBe(false);
    });

    it('does not verify a body whose valid content-digest header is uncovered', async () => {
      const body = '{"roles":["admin"]}';
      const headers: Record<string, string> = { 'content-type': 'application/json' };

      // signRequest leaves an *honest* Content-Digest in `headers`: it is the
      // real digest of the body that will be delivered, so both the presence
      // check and verifyContentDigest pass on it.
      const sigHeaders = await signRequest(method, targetUri, headers, body, privateKey, keyId);
      const honestDigest = await createContentDigest(body);
      expect(sigHeaders['Content-Digest']).toBe(honestDigest);
      expect(headers['content-digest']).toBe(honestDigest);

      // Re-sign the same request over a list that drops content-digest while
      // that valid header stays in place. This is the A-07 bypass that was
      // actually live, and the one the sibling case above cannot see: there,
      // no digest header exists at all. Here presence and digest-match both
      // hold, so only `components.includes('content-digest')` stands between
      // this signature and a body it never bound. A partial regression that
      // keeps `if (!digestHeader) return fail` and drops the coverage line
      // accepts it.
      Object.assign(
        headers,
        await signWithComponents(['@method', '@target-uri', 'content-type'], headers),
      );
      expect(headers['signature-input']).not.toContain('content-digest');
      expect(headers['content-digest']).toBe(honestDigest);

      const resolver = createMockDidResolver(publicJwk);
      const result = await verifyRequest(method, targetUri, headers, body, resolver);

      expect(result.verified).toBe(false);
    });

    it('does not verify when @method is omitted from the covered list', async () => {
      const headers: Record<string, string> = {};
      Object.assign(headers, await signWithComponents(['@target-uri'], headers));

      const resolver = createMockDidResolver(publicJwk);
      const result = await verifyRequest(method, targetUri, headers, null, resolver);

      expect(result.verified).toBe(false);
    });

    it('does not verify when @target-uri is omitted from the covered list', async () => {
      const headers: Record<string, string> = {};
      Object.assign(headers, await signWithComponents(['@method'], headers));

      const resolver = createMockDidResolver(publicJwk);
      const result = await verifyRequest(method, targetUri, headers, null, resolver);

      expect(result.verified).toBe(false);
    });

    it('does not accept @METHOD in place of @method (no case folding)', async () => {
      // buildSignatureBase only special-cases the lowercase spelling, so
      // "@METHOD" is treated as a (missing) header and binds nothing.
      const headers: Record<string, string> = {};
      Object.assign(headers, await signWithComponents(['@METHOD', '@target-uri'], headers));

      const resolver = createMockDidResolver(publicJwk);
      const result = await verifyRequest(method, targetUri, headers, null, resolver);

      expect(result.verified).toBe(false);
    });

    it('does not accept @TARGET-URI in place of @target-uri (no case folding)', async () => {
      // Twin of the @METHOD case above: buildSignatureBase special-cases only
      // the lowercase spelling, so "@TARGET-URI" is a lookup for a header that
      // does not exist and binds nothing.
      const headers: Record<string, string> = {};
      Object.assign(headers, await signWithComponents(['@method', '@TARGET-URI'], headers));

      const resolver = createMockDidResolver(publicJwk);
      const result = await verifyRequest(method, targetUri, headers, null, resolver);

      expect(result.verified).toBe(false);
    });
  });
});
