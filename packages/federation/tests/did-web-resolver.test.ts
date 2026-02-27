import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DidWebResolver } from '../src/http/did-web-resolver.js';

describe('DidWebResolver', () => {
  const mockDidDocument = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: 'did:web:example.com' as import('@coopsource/common').DID,
    verificationMethod: [],
    service: [],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves a did:web to a DID document', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDidDocument),
      }),
    );

    const resolver = new DidWebResolver();
    const doc = await resolver.resolve('did:web:example.com');

    expect(doc.id).toBe('did:web:example.com');
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/.well-known/did.json',
    );
  });

  it('caches resolved documents', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDidDocument),
      }),
    );

    const resolver = new DidWebResolver();
    await resolver.resolve('did:web:example.com');
    await resolver.resolve('did:web:example.com');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refetches after cache expires', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDidDocument),
      }),
    );

    const resolver = new DidWebResolver({ cacheTtlMs: 50 });
    await resolver.resolve('did:web:example.com');

    // Wait for cache to expire
    await new Promise((r) => setTimeout(r, 60));

    await resolver.resolve('did:web:example.com');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('invalidate() clears a cache entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDidDocument),
      }),
    );

    const resolver = new DidWebResolver();
    await resolver.resolve('did:web:example.com');
    resolver.invalidate('did:web:example.com');
    await resolver.resolve('did:web:example.com');

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws on non-200 responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    );

    const resolver = new DidWebResolver();
    await expect(resolver.resolve('did:web:notfound.com')).rejects.toThrow(
      'Failed to resolve did:web:notfound.com: HTTP 404',
    );
  });

  it('resolves localhost with port', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDidDocument),
      }),
    );

    const resolver = new DidWebResolver();
    await resolver.resolve('did:web:localhost%3A3001');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/.well-known/did.json',
    );
  });
});
