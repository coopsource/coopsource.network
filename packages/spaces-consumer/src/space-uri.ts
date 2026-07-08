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
 * The current reference parser treats `skey` as one path segment and does not
 * decode it back to an application key. CSN keeps slash-bearing semantic keys
 * internally, so the atproto wire `skey` is an explicit percent-encoded mapping
 * such as `roles/board` -> `roles%2Fboard`. Any upstream space creation path
 * must use the same mapping, otherwise the writer will reference a different
 * space than CSN's internal `SpaceRef`.
 */

export interface SpaceRecordUri {
  readonly spaceDid: string; // space authority DID (our SpaceRef.arbiterDid)
  readonly spaceType: string; // NSID
  readonly skey: string;
  readonly authorDid: string;
  readonly collection: string; // NSID
  readonly rkey: string;
}

export interface SpaceUri {
  readonly spaceDid: string; // space authority DID (our SpaceRef.arbiterDid)
  readonly spaceType: string; // NSID
  readonly skey: string;
}

const SPACE_SEGMENT = 'space';

/** Format a permissioned-space URI. Does not validate DID/NSID syntax. */
export function formatSpaceUri(u: SpaceUri): string {
  return [
    `at://${u.spaceDid}`,
    SPACE_SEGMENT,
    encodePathSegment(u.spaceType),
    toAtprotoSpaceSkey(u.skey),
  ].join('/');
}

/** Format a permissioned-record URI. Does not validate DID/NSID syntax. */
export function formatSpaceRecordUri(u: SpaceRecordUri): string {
  return [
    formatSpaceUri(u),
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

  const [
    encodedSpaceType,
    wireSkey,
    encodedAuthorDid,
    encodedCollection,
    encodedRkey,
  ] = encodedParts as [string, string, string, string, string];
  const skey = fromAtprotoSpaceSkey(wireSkey);
  const decodedParts = decodePathSegments([
    encodedSpaceType,
    encodedAuthorDid,
    encodedCollection,
    encodedRkey,
  ]);
  if (!skey || !decodedParts || decodedParts.some((part) => !part)) return null;
  const [spaceType, authorDid, collection, rkey] = decodedParts;

  return { spaceDid, spaceType, skey, authorDid, collection, rkey };
}

/**
 * Parse a permissioned-space URI. Returns `null` for record URIs, public
 * `at://` records, wrong scheme, query/fragment suffixes, empty components, or
 * the wrong number of path segments. Never throws.
 */
export function parseSpaceUri(uri: string): SpaceUri | null {
  if (typeof uri !== 'string') return null;
  if (!uri.startsWith('at://')) return null;
  if (uri.includes('?') || uri.includes('#')) return null;

  const rest = uri.slice('at://'.length);
  const parts = rest.split('/');
  // spaceDid / "space" / spaceType / skey
  if (parts.length !== 4) return null;
  const [spaceDid, marker, ...encodedParts] = parts;
  if (marker !== SPACE_SEGMENT) return null;
  if (!spaceDid || encodedParts.some((part) => !part)) {
    return null;
  }

  const [encodedSpaceType, wireSkey] = encodedParts as [string, string];
  const skey = fromAtprotoSpaceSkey(wireSkey);
  const decodedParts = decodePathSegments([encodedSpaceType]);
  if (!skey || !decodedParts || decodedParts.some((part) => !part)) return null;
  const [spaceType] = decodedParts;

  return { spaceDid, spaceType, skey };
}

/** True if `uri` is a permissioned-space record URI (vs a plain public at:// URI). */
export function isSpaceRecordUri(uri: string): boolean {
  return parseSpaceRecordUri(uri) !== null;
}

export function toAtprotoSpaceSkey(spaceKey: string): string {
  return encodePathSegment(spaceKey);
}

export function fromAtprotoSpaceSkey(wireSkey: string): string | null {
  try {
    return decodeURIComponent(wireSkey);
  } catch {
    return null;
  }
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
