/**
 * Validate that a URL is safe to call (prevent SSRF).
 * Requires HTTPS and blocks private/internal addresses.
 *
 * Used by ActionExecutor (webhook triggers) and ScriptWorkerPool (script HTTP calls).
 */
export function validateWebhookUrl(raw: string): URL {
  const parsed = new URL(raw);

  if (parsed.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS');
  }

  const hostname = parsed.hostname;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname === '169.254.169.254' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Webhook URL must not point to internal/private addresses');
  }

  return parsed;
}
