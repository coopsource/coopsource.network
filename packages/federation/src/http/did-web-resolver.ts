import { didWebToUrl } from '@coopsource/common';
import type { DidDocument } from '../types.js';
import {
  BlockedAddressError,
  safeFetchJson,
  type SafeFetchOptions,
} from './url-safety.js';

export interface DidWebResolverOptions {
  cacheTtlMs?: number;
  /** Fallback resolver for non-did:web DIDs (e.g. did:plc in local dev). */
  fallbackResolve?: (did: string) => Promise<DidDocument>;
  /**
   * Outbound-fetch containment (audit S-08). The target URL is derived from a
   * DID an unauthenticated caller supplies — `verifyRequest` resolves the
   * signer before it can check the signature, because the key it needs to check
   * with is in the document — so this fetch is attacker-steerable by
   * construction and has to be guarded rather than trusted.
   */
  outbound?: SafeFetchOptions;
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
  private fallbackResolve?: (did: string) => Promise<DidDocument>;
  private outbound?: SafeFetchOptions;

  constructor(options?: DidWebResolverOptions) {
    this.cacheTtlMs = options?.cacheTtlMs ?? 5 * 60 * 1000;
    this.fallbackResolve = options?.fallbackResolve;
    this.outbound = options?.outbound;
  }

  async resolve(did: string): Promise<DidDocument> {
    const cached = this.cache.get(did);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.doc;
    }

    // Non-did:web identifiers (e.g. did:plc) need a fallback resolver
    if (!did.startsWith('did:web:')) {
      if (!this.fallbackResolve) {
        throw new Error(`Cannot resolve non-did:web identifier without fallback: ${did}`);
      }
      const doc = await this.fallbackResolve(did);
      this.cache.set(did, { doc, expiresAt: Date.now() + this.cacheTtlMs });
      return doc;
    }

    const url = didWebToUrl(did);

    let doc: DidDocument;
    try {
      doc = (await safeFetchJson(url, this.outbound)) as DidDocument;
    } catch (err) {
      // A refusal is reported as itself, so a caller can tell "this DID names
      // somewhere we will not dial" apart from "that host answered badly".
      if (err instanceof BlockedAddressError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to resolve ${did}: ${message}`);
    }

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
