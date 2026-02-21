/**
 * AT URI encoding utilities.
 * Uses percent-encoding for URL-safe parameter transport.
 */

/** Encode an AT URI to a URL-safe string for use in route params */
export function encodeAtUri(uri: string): string {
  return encodeURIComponent(uri);
}

/** Decode a URL-safe string back to an AT URI */
export function decodeAtUri(encoded: string): string {
  return decodeURIComponent(encoded);
}

/** Extract the record key (rkey) from an AT URI */
export function extractRkey(uri: string): string {
  const parts = uri.split('/');
  const rkey = parts[parts.length - 1];
  if (!rkey) {
    throw new Error(`Invalid AT URI: ${uri}`);
  }
  return rkey;
}

/** Build an AT URI from components */
export function buildAtUri(did: string, collection: string, rkey: string): string {
  return `at://${did}/${collection}/${rkey}`;
}
