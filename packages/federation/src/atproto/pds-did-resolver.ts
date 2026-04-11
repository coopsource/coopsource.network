import { AtpAgent } from '@atproto/api';

/**
 * Module-level cache of `pdsUrl -> pdsServiceDid`. PDS DIDs do not rotate in
 * practice — a PDS's `did` is tied to its own key material and rotating it
 * would require the PDS to republish its DID document. If that ever happens,
 * operators bounce CSN; we don't attempt invalidation here.
 */
const pdsDidCache = new Map<string, string>();

/**
 * Resolve the DID of a PDS service by calling `com.atproto.server.describeServer`.
 *
 * The returned DID is the value that goes in the `aud` claim of service-auth
 * JWTs addressed to that PDS. The canonical source is the PDS's own
 * `describeServer` output (which includes a `did` field) — not the service
 * endpoint URL of the `#atproto_pds` entry in the cooperative's DID document.
 * Derivation from `did:web:<host>` is a heuristic and not spec-guaranteed;
 * `describeServer` is authoritative.
 *
 * Results are cached per `pdsUrl` for the lifetime of the process. First call
 * per URL hits the network (lazy, not at boot); subsequent calls are O(1).
 */
export async function resolvePdsServiceDid(pdsUrl: string): Promise<string> {
  const cached = pdsDidCache.get(pdsUrl);
  if (cached) return cached;

  const agent = new AtpAgent({ service: pdsUrl });
  const response = await agent.api.com.atproto.server.describeServer();
  const did = response.data.did;

  if (!did || typeof did !== 'string') {
    throw new Error(
      `describeServer at ${pdsUrl} did not return a DID (got: ${JSON.stringify(response.data.did)})`,
    );
  }

  pdsDidCache.set(pdsUrl, did);
  return did;
}

/**
 * Clear the module-level PDS DID cache. Test-only escape hatch — production
 * code should never need to invalidate this cache.
 */
export function __resetPdsDidCacheForTests(): void {
  pdsDidCache.clear();
}
