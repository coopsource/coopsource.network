import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) {
    // V8.4 — direct hop to /me (was /dashboard which 301s to /me).
    redirect(302, '/me');
  }
  // Show landing page for unauthenticated users
  return {};
};
