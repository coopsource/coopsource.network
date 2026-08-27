import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DidWebResolver } from '../src/http/did-web-resolver.js';
import { BlockedAddressError } from '../src/http/url-safety.js';

/**
 * The resolver dials a URL an unauthenticated caller chooses, so every test
 * here injects its own DNS answer rather than reaching the network (audit
 * S-08). `publicLookup` stands in for "this name resolves somewhere public".
 */
const publicLookup = async () => ['93.184.216.34'];

describe('DidWebResolver', () => {
  const mockDidDocument = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: 'did:web:example.com' as import('@coopsource/common').DID,
    verificationMethod: [],
    service: [],
  };

  const okResponse = () =>
    new Response(JSON.stringify(mockDidDocument), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves a did:web to a DID document', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const resolver = new DidWebResolver({
      outbound: { lookup: publicLookup, fetchImpl },
    });

    const doc = await resolver.resolve('did:web:example.com');

    expect(doc.id).toBe('did:web:example.com');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.com/.well-known/did.json',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('caches resolved documents', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const resolver = new DidWebResolver({
      outbound: { lookup: publicLookup, fetchImpl },
    });

    await resolver.resolve('did:web:example.com');
    await resolver.resolve('did:web:example.com');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refetches after cache expires', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const resolver = new DidWebResolver({
      cacheTtlMs: 50,
      outbound: { lookup: publicLookup, fetchImpl },
    });

    await resolver.resolve('did:web:example.com');
    await new Promise((r) => setTimeout(r, 60));
    await resolver.resolve('did:web:example.com');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('invalidate() clears a cache entry', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const resolver = new DidWebResolver({
      outbound: { lookup: publicLookup, fetchImpl },
    });

    await resolver.resolve('did:web:example.com');
    resolver.invalidate('did:web:example.com');
    await resolver.resolve('did:web:example.com');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws on non-200 responses', async () => {
    const resolver = new DidWebResolver({
      outbound: {
        lookup: publicLookup,
        fetchImpl: async () => new Response(null, { status: 404 }),
      },
    });

    await expect(resolver.resolve('did:web:notfound.com')).rejects.toThrow(
      'Failed to resolve did:web:notfound.com: HTTP 404',
    );
  });

  it('resolves localhost with port when loopback is permitted', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const resolver = new DidWebResolver({
      outbound: { lookup: publicLookup, fetchImpl, allowLoopback: true, allowHttp: true },
    });

    await resolver.resolve('did:web:localhost%3A3001');

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3001/.well-known/did.json',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  // ── Audit S-08 ──────────────────────────────────────────────────────────

  it('refuses a did:web naming a private address, without fetching', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const resolver = new DidWebResolver({
      outbound: { fetchImpl, lookup: publicLookup },
    });

    await expect(resolver.resolve('did:web:169.254.169.254')).rejects.toThrow(
      BlockedAddressError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a percent-encoded port on a private address', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const resolver = new DidWebResolver({
      outbound: { fetchImpl, lookup: publicLookup },
    });

    await expect(resolver.resolve('did:web:127.0.0.1%3A6379')).rejects.toThrow(
      BlockedAddressError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a public hostname that resolves to a private address', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const resolver = new DidWebResolver({
      outbound: { fetchImpl, lookup: async () => ['10.0.0.1'] },
    });

    await expect(resolver.resolve('did:web:rebind.example')).rejects.toThrow(
      BlockedAddressError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses to follow a redirect', async () => {
    const resolver = new DidWebResolver({
      outbound: {
        lookup: publicLookup,
        fetchImpl: async () =>
          new Response(null, {
            status: 302,
            headers: { location: 'http://169.254.169.254/latest/meta-data/' },
          }),
      },
    });

    await expect(resolver.resolve('did:web:example.com')).rejects.toThrow(
      /redirect/i,
    );
  });

  it('does not cache a refusal as if it were a document', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const resolver = new DidWebResolver({
      outbound: { fetchImpl, lookup: publicLookup },
    });

    await expect(resolver.resolve('did:web:10.0.0.1')).rejects.toThrow();
    await expect(resolver.resolve('did:web:10.0.0.1')).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
