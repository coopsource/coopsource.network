/**
 * Permissioned-record URI helpers.
 *
 * Upstream proposal 0016 reuses the `at://` scheme with a `/space/` segment:
 *
 *   at://{spaceDid}/space/{spaceType}/{skey}/{authorDid}/{collection}/{rkey}
 *
 * The shape is still marked "likely to change" upstream, so all parsing/
 * formatting of permissioned-record URIs goes through these helpers rather
 * than string literals elsewhere (ARCHITECTURE-V12 §5, Pitfall #3). A plain
 * public `at://did/collection/rkey` URI is deliberately NOT a space URI and
 * parses to `null`.
 *
 * Path components are percent-encoded at this boundary because CSN space keys
 * can contain `/` (for example `roles/board` and `classes/worker`).
 */

export interface SpaceRecordUri {
  readonly spaceDid: string; // space authority DID (our SpaceRef.arbiterDid)
  readonly spaceType: string; // NSID
  readonly skey: string;
  readonly authorDid: string;
  readonly collection: string; // NSID
  readonly rkey: string;
}

const SPACE_SEGMENT = 'space';

/** Format a permissioned-record URI. Does not validate DID/NSID syntax. */
export function formatSpaceRecordUri(u: SpaceRecordUri): string {
  return [
    `at://${u.spaceDid}`,
    SPACE_SEGMENT,
    encodePathSegment(u.spaceType),
    encodePathSegment(u.skey),
    encodePathSegment(u.authorDid),
    encodePathSegment(u.collection),
    encodePathSegment(u.rkey),
  ].join('/');
}

/**
 * Parse a permissioned-record URI. Returns `null` for anything that is not a
 * well-formed space URI — including plain public `at://` records, wrong
 * scheme, a missing `/space/` marker, query/fragment suffixes, empty
 * components, or the wrong number of path segments. Never throws.
 */
export function parseSpaceRecordUri(uri: string): SpaceRecordUri | null {
  if (typeof uri !== 'string') return null;
  if (!uri.startsWith('at://')) return null;
  // Reject query/fragment rather than silently keeping them in the last segment.
  if (uri.includes('?') || uri.includes('#')) return null;

  const rest = uri.slice('at://'.length);
  const parts = rest.split('/');
  // spaceDid / "space" / spaceType / skey / authorDid / collection / rkey
  if (parts.length !== 7) return null;
  const [spaceDid, marker, ...encodedParts] = parts;
  if (marker !== SPACE_SEGMENT) return null;
  if (!spaceDid || encodedParts.some((part) => !part)) {
    return null;
  }

  const decodedParts = decodePathSegments(encodedParts);
  if (!decodedParts || decodedParts.some((part) => !part)) return null;
  const [spaceType, skey, authorDid, collection, rkey] = decodedParts;

  return { spaceDid, spaceType, skey, authorDid, collection, rkey };
}

/** True if `uri` is a permissioned-space record URI (vs a plain public at:// URI). */
export function isSpaceRecordUri(uri: string): boolean {
  return parseSpaceRecordUri(uri) !== null;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/%3A/gi, ':');
}

function decodePathSegments(parts: string[]): string[] | null {
  try {
    return parts.map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }
}
