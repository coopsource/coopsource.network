import type { Cookies } from '@sveltejs/kit';

/**
 * Extracts the Set-Cookie header from an API response and forwards it to the
 * browser via SvelteKit's cookies API.
 *
 * This is necessary because SvelteKit does not automatically propagate
 * Set-Cookie headers from server-side fetch calls to external APIs.
 */
export function forwardSessionCookie(res: Response, cookies: Cookies): void {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return;

  // Parse: "connect.sid=s%3A...; Path=/; Expires=...; HttpOnly; SameSite=Lax"
  const [nameValue, ...attrs] = setCookie.split(';').map((s) => s.trim());
  const eqIdx = nameValue.indexOf('=');
  if (eqIdx === -1) return;

  const name = nameValue.slice(0, eqIdx);
  const value = nameValue.slice(eqIdx + 1);
  const attrsLower = attrs.map((a) => a.toLowerCase());

  // Determine maxAge from Max-Age or Expires attribute
  let maxAge: number | undefined;
  const maxAgeAttr = attrs.find((a) => a.toLowerCase().startsWith('max-age='));
  const expiresAttr = attrs.find((a) => a.toLowerCase().startsWith('expires='));
  if (maxAgeAttr) {
    maxAge = parseInt(maxAgeAttr.split('=')[1] ?? '0', 10);
  } else if (expiresAttr) {
    const exp = new Date(expiresAttr.split('=').slice(1).join('='));
    maxAge = Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000));
  }

  const sameSite = attrsLower.some((a) => a.startsWith('samesite=strict'))
    ? 'strict'
    : attrsLower.some((a) => a.startsWith('samesite=none'))
      ? 'none'
      : 'lax';

  cookies.set(name, value, {
    path: '/',
    httpOnly: attrsLower.includes('httponly'),
    secure: attrsLower.includes('secure'),
    sameSite,
    maxAge,
    // The value from Set-Cookie is already URL-encoded by express-session.
    // Prevent SvelteKit from encoding it again.
    encode: (v) => v,
  });
}
