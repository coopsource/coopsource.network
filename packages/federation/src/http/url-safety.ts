import { lookup as dnsLookup } from 'node:dns/promises';

/**
 * Outbound-fetch containment (audit S-08).
 *
 * Every outbound request whose target is influenced by a caller — did:web
 * resolution, webhook delivery, script HTTP calls — goes through here. The
 * previous implementation compared hostnames against a handful of exact
 * strings, which missed every IPv6 form and all but one address of each private
 * range. See the address table in `tests/url-safety.test.ts`.
 */

export class BlockedAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedAddressError';
  }
}

/** Hostnames that name an internal network rather than an address. */
const INTERNAL_SUFFIXES = ['.local', '.internal', '.localhost', '.home.arpa'];
const INTERNAL_NAMES = ['localhost', 'metadata.google.internal'];

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function isPrivateIpv4(address: string): boolean {
  const match = IPV4.exec(address);
  if (!match) return false;

  const octets = match.slice(1, 5).map(Number);
  if (octets.some((o) => Number.isNaN(o) || o > 255)) return true; // malformed → refuse
  const [a, b] = octets as [number, number, number, number];

  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback, the whole /8
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0 && octets[2] === 0) return true; // IETF assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast

  return false;
}

function isLoopbackIpv4(address: string): boolean {
  const match = IPV4.exec(address);
  return match ? Number(match[1]) === 127 : false;
}

/**
 * Classify an address as one that must not be dialled from user-influenced
 * input. Accepts an IPv6 literal with or without brackets.
 */
export function isPrivateAddress(address: string): boolean {
  const host = stripBrackets(address.trim()).toLowerCase();

  if (IPV4.test(host)) return isPrivateIpv4(host);
  if (!host.includes(':')) return false; // not an IP literal at all

  // IPv4-mapped and IPv4-compatible forms carry an IPv4 address in the last
  // group; unwrap and classify that, or an attacker reaches 127.0.0.1 by
  // spelling it ::ffff:127.0.0.1.
  const lastGroup = host.slice(host.lastIndexOf(':') + 1);
  if (IPV4.test(lastGroup)) return isPrivateIpv4(lastGroup);

  if (host === '::' || host === '::1') return true;

  const firstGroup = host.split(':').find((group) => group.length > 0) ?? '';
  if (firstGroup.startsWith('fc') || firstGroup.startsWith('fd')) return true; // unique local
  if (/^fe[89ab]/.test(firstGroup)) return true; // link-local
  if (firstGroup.startsWith('ff')) return true; // multicast

  return false;
}

function isLoopbackHost(host: string): boolean {
  const bare = stripBrackets(host).toLowerCase();
  return bare === 'localhost' || bare === '::1' || isLoopbackIpv4(bare);
}

export interface UrlSafetyOptions {
  /** Permit `http:`. Off by default; did:web local development turns it on. */
  readonly allowHttp?: boolean;
  /** Permit loopback targets. Off by default; local development turns it on. */
  readonly allowLoopback?: boolean;
  /**
   * Permit any private-network target, and http. Off by default. Needed by the
   * Docker federation stack, where instances address each other by service name
   * over the bridge network, so every peer resolves to a private address.
   * Implies `allowLoopback` and `allowHttp`.
   */
  readonly allowPrivate?: boolean;
}

/**
 * Parse a URL and refuse it if the scheme or the host is not safe to dial.
 *
 * Pure: this does no DNS. A hostname that resolves to a private address is
 * caught by `safeFetchJson`, which checks the answer before connecting.
 */
export function assertSafeUrl(raw: string, options?: UrlSafetyOptions): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BlockedAddressError(`Not a valid URL: ${raw}`);
  }

  const allowPrivate = options?.allowPrivate ?? false;
  const allowHttp = allowPrivate || (options?.allowHttp ?? false);
  if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) {
    throw new BlockedAddressError(
      `Refusing to fetch ${parsed.protocol}//: only ${allowHttp ? 'http(s)' : 'https'} is allowed`,
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (allowPrivate) return parsed;

  const loopbackAllowed = options?.allowLoopback ?? false;
  if (loopbackAllowed && isLoopbackHost(host)) return parsed;

  if (INTERNAL_NAMES.includes(stripBrackets(host))) {
    throw new BlockedAddressError(`Refusing to fetch internal host ${host}`);
  }
  if (INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new BlockedAddressError(`Refusing to fetch internal host ${host}`);
  }
  if (isPrivateAddress(host)) {
    throw new BlockedAddressError(`Refusing to fetch private address ${host}`);
  }

  return parsed;
}

export type LookupFn = (hostname: string) => Promise<readonly string[]>;
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface SafeFetchOptions extends UrlSafetyOptions {
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  /** Injectable for tests; defaults to the system resolver. */
  readonly lookup?: LookupFn;
  /** Injectable for tests; defaults to global fetch. */
  readonly fetchImpl?: FetchFn;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BYTES = 256 * 1024;

async function systemLookup(hostname: string): Promise<readonly string[]> {
  const answers = await dnsLookup(hostname, { all: true });
  return answers.map((answer) => answer.address);
}

/**
 * Fetch JSON from a URL that a caller can influence.
 *
 * KNOWN LIMIT: the DNS answer is checked and then a separate connection is
 * made, so a name that answers differently the second time — a true DNS
 * rebinding race — is not prevented. Closing that requires pinning the socket
 * to the address that was checked, which means a custom dispatcher rather than
 * `fetch`. This stops the straightforward case of a public hostname whose
 * record points at an internal address.
 */
/**
 * Fetch a URL that a caller can influence, with the destination checked and
 * redirects refused.
 *
 * KNOWN LIMIT: the DNS answer is checked and then a separate connection is
 * made, so a name that answers differently the second time — a true DNS
 * rebinding race — is not prevented. Closing that requires pinning the socket
 * to the address that was checked, which means a custom dispatcher rather than
 * `fetch`. This stops the straightforward case of a public hostname whose
 * record points at an internal address.
 */
export async function safeFetch(
  raw: string,
  init?: RequestInit,
  options?: SafeFetchOptions,
): Promise<Response> {
  const url = assertSafeUrl(raw, options);
  const lookup = options?.lookup ?? systemLookup;
  const fetchImpl = options?.fetchImpl ?? fetch;

  const host = stripBrackets(url.hostname);
  const isIpLiteral = IPV4.test(host) || host.includes(':');
  const allowPrivate = options?.allowPrivate ?? false;
  const loopbackAllowed = allowPrivate || (options?.allowLoopback ?? false);

  if (!allowPrivate && !isIpLiteral && !(loopbackAllowed && isLoopbackHost(host))) {
    const addresses = await lookup(host);
    for (const address of addresses) {
      if (isPrivateAddress(address)) {
        throw new BlockedAddressError(
          `Refusing to fetch ${host}: it resolves to private address ${address}`,
        );
      }
    }
  }

  const response = await fetchImpl(url.toString(), {
    ...init,
    // `manual` surfaces the 3xx instead of following it, so the Location header
    // never becomes a second, unchecked request to an address nothing vetted.
    redirect: 'manual',
    signal: init?.signal ?? AbortSignal.timeout(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (response.status >= 300 && response.status < 400) {
    throw new BlockedAddressError(
      `Refusing to follow redirect from ${url.toString()} (HTTP ${response.status})`,
    );
  }

  return response;
}

/** Read a bounded response body as text, refusing anything over the cap. */
export async function readBounded(
  response: Response,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > maxBytes) {
    throw new Error(`Response too large: ${declared} bytes`);
  }
  const text = await response.text();
  if (text.length > maxBytes) {
    throw new Error(`Response too large: ${text.length} bytes`);
  }
  return text;
}

export async function safeFetchJson(
  raw: string,
  options?: SafeFetchOptions,
): Promise<unknown> {
  const response = await safeFetch(
    raw,
    { headers: { accept: 'application/json' } },
    options,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return JSON.parse(await readBounded(response, options?.maxBytes ?? DEFAULT_MAX_BYTES));
}
