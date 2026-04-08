import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
  // V8.2 — /dashboard moved to /me.
  // V8.4 — kept as a 301 stale-bookmark catcher; no internal callsite
  // links here anymore. Remove in V8.9 polish or later.
  redirect(301, '/me');
};
