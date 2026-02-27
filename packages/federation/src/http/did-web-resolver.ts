import { didWebToUrl } from '@coopsource/common';
import type { DidDocument } from '../types.js';

export interface DidWebResolverOptions {
  cacheTtlMs?: number;
}

interface CacheEntry {
  doc: DidDocument;
  expiresAt: number;
}

/**
 * Resolves did:web identifiers by fetching /.well-known/did.json (or path-based did.json).
 * Caches resolved documents with a configurable TTL (default 5 minutes).
 */
export class DidWebResolver {
  private cache = new Map<string, CacheEntry>();
  private cacheTtlMs: number;

  constructor(options?: DidWebResolverOptions) {
    this.cacheTtlMs = options?.cacheTtlMs ?? 5 * 60 * 1000;
  }

  async resolve(did: string): Promise<DidDocument> {
    const cached = this.cache.get(did);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.doc;
    }

    const url = didWebToUrl(did);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to resolve ${did}: HTTP ${response.status}`);
    }

    const doc = (await response.json()) as DidDocument;

    this.cache.set(did, {
      doc,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    return doc;
  }

  invalidate(did: string): void {
    this.cache.delete(did);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
