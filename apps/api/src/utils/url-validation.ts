import { assertSafeUrl, safeFetch } from '@coopsource/federation/http';

/**
 * Validate that a URL is safe to call, and call it with the destination
 * checked (audit S-08).
 *
 * Used by ActionExecutor (webhook triggers) and ScriptWorkerPool (script HTTP
 * calls). The address classification lives in `@coopsource/federation/http` so
 * that did:web resolution and these two paths cannot drift apart — the previous
 * local implementation compared hostnames against a handful of exact strings
 * and allowed every IPv6 form, all of `127.0.0.0/8` except `127.0.0.1`, all of
 * `169.254.0.0/16` except the one metadata address, `0.0.0.0`, and CGNAT.
 */
export function validateWebhookUrl(raw: string): URL {
  return assertSafeUrl(raw);
}

/**
 * Fetch an outbound URL supplied by a cooperative's own configuration or
 * script, with the destination checked, the DNS answer checked, and redirects
 * refused rather than followed.
 *
 * Behaviour change worth knowing: a webhook endpoint that answers 3xx is now an
 * error rather than a followed redirect, because following one would dial an
 * address nothing vetted.
 */
export function fetchOutbound(
  raw: string,
  init?: RequestInit,
): Promise<Response> {
  return safeFetch(raw, init, { timeoutMs: 10_000 });
}
