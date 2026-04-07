import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
  // V8.2 — /dashboard moved to /me
  redirect(301, '/me');
};
