/**
 * did:web parsing and construction utilities.
 *
 * Implements the did:web method specification:
 * https://w3c-ccg.github.io/did-method-web/
 *
 * Key rules:
 * - Domain colons (e.g. port numbers) are percent-encoded as %3A
 * - Colon separators in the DID become path separators in the URL
 * - If no path segments after domain, resolve to /.well-known/did.json
 * - If path segments exist, resolve to /path/segments/did.json
 * - localhost and IP addresses use http://; all others use https://
 */

const DID_WEB_PREFIX = 'did:web:';

/**
 * Check whether a host should use http:// instead of https://.
 * Returns true for localhost and IP addresses.
 */
function isInsecureHost(host: string): boolean {
  const hostname = host.split(':')[0]!;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

/**
 * Extract host (with port) and pathname from a URL string.
 * Avoids dependency on Node.js URL or DOM URL APIs.
 */
function parseUrl(url: string): { host: string; pathname: string } {
  // Match protocol://host[:port][/path]
  const match = url.match(/^https?:\/\/([^/?#]+)(\/[^?#]*)?/);
  if (!match) {
    throw new Error(`Invalid URL: ${url}`);
  }
  const host = match[1]!;
  const pathname = (match[2] ?? '/').replace(/\/+$/, '') || '/';
  return { host, pathname };
}

/**
 * Parse a did:web identifier to the URL where its DID document can be fetched.
 *
 * @example
 * didWebToUrl('did:web:example.com')
 * // => 'https://example.com/.well-known/did.json'
 *
 * didWebToUrl('did:web:example.com:path:seg')
 * // => 'https://example.com/path/seg/did.json'
 *
 * didWebToUrl('did:web:localhost%3A3001')
 * // => 'http://localhost:3001/.well-known/did.json'
 */
export function didWebToUrl(did: string): string {
  if (!isDidWeb(did)) {
    throw new Error(`Invalid did:web identifier: ${did}`);
  }

  const methodSpecificId = did.slice(DID_WEB_PREFIX.length);
  const parts = methodSpecificId.split(':');

  const domain = decodeURIComponent(parts[0]!);
  const pathSegments = parts.slice(1).map(decodeURIComponent);

  const protocol = isInsecureHost(domain) ? 'http' : 'https';

  if (pathSegments.length === 0) {
    return `${protocol}://${domain}/.well-known/did.json`;
  }

  return `${protocol}://${domain}/${pathSegments.join('/')}/did.json`;
}

/**
 * Construct a did:web identifier from a URL.
 *
 * @example
 * urlToDidWeb('https://acme.coopsource.network')
 * // => 'did:web:acme.coopsource.network'
 *
 * urlToDidWeb('http://localhost:3001')
 * // => 'did:web:localhost%3A3001'
 *
 * urlToDidWeb('https://example.com/path/to')
 * // => 'did:web:example.com:path:to'
 */
export function urlToDidWeb(url: string): string {
  const { host, pathname } = parseUrl(url);

  // Percent-encode colons in host (port separator)
  const encodedHost = host.replace(/:/g, '%3A');

  const pathSegments = pathname
    .split('/')
    .filter((seg: string) => seg.length > 0);

  if (pathSegments.length === 0) {
    return `${DID_WEB_PREFIX}${encodedHost}`;
  }

  const encodedPath = pathSegments.map(encodeURIComponent).join(':');
  return `${DID_WEB_PREFIX}${encodedHost}:${encodedPath}`;
}

/**
 * Build a path-based did:web for a member under an instance.
 *
 * @example
 * buildMemberDidWeb('https://acme.coopsource.network', 'alice')
 * // => 'did:web:acme.coopsource.network:members:alice'
 *
 * buildMemberDidWeb('http://localhost:3001', 'bob')
 * // => 'did:web:localhost%3A3001:members:bob'
 */
export function buildMemberDidWeb(instanceUrl: string, handle: string): string {
  const { host } = parseUrl(instanceUrl);
  const encodedHost = host.replace(/:/g, '%3A');
  return `${DID_WEB_PREFIX}${encodedHost}:members:${encodeURIComponent(handle)}`;
}

/**
 * Check if a DID is a did:web identifier.
 */
export function isDidWeb(did: string): boolean {
  return did.startsWith(DID_WEB_PREFIX) && did.length > DID_WEB_PREFIX.length;
}
