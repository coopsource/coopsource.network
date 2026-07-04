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
  return `at://${u.spaceDid}/${SPACE_SEGMENT}/${u.spaceType}/${u.skey}/${u.authorDid}/${u.collection}/${u.rkey}`;
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
  const [spaceDid, marker, spaceType, skey, authorDid, collection, rkey] = parts;
  if (marker !== SPACE_SEGMENT) return null;
  if (
    !spaceDid ||
    !spaceType ||
    !skey ||
    !authorDid ||
    !collection ||
    !rkey
  ) {
    return null;
  }
  return { spaceDid, spaceType, skey, authorDid, collection, rkey };
}

/** True if `uri` is a permissioned-space record URI (vs a plain public at:// URI). */
export function isSpaceRecordUri(uri: string): boolean {
  return parseSpaceRecordUri(uri) !== null;
}
