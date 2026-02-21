import type { Handle } from '@sveltejs/kit';
import type { AuthUser } from '$lib/api/types.js';

import { env } from '$env/dynamic/private';

const API_BASE = env.API_URL ?? 'http://localhost:3001';

export const handle: Handle = async ({ event, resolve }) => {
  const cookie = event.request.headers.get('cookie');

  if (cookie) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
        headers: { cookie },
      });

      if (res.ok) {
        event.locals.user = (await res.json()) as AuthUser;
      } else {
        event.locals.user = null;
      }
    } catch {
      event.locals.user = null;
    }
  } else {
    event.locals.user = null;
  }

  return resolve(event);
};
