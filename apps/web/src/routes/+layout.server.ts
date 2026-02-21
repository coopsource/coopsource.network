import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types.js';

const API_BASE = process.env.API_URL ?? 'http://localhost:3099';

export const load: LayoutServerLoad = async ({ locals, url, fetch }) => {
  // Check setup status first
  try {
    const setupRes = await fetch(`${API_BASE}/api/v1/setup/status`);
    if (setupRes.ok) {
      const { setupComplete } = (await setupRes.json()) as { setupComplete: boolean };
      if (!setupComplete && url.pathname !== '/setup') {
        redirect(302, '/setup');
      }
    }
  } catch {
    // If setup check fails, continue (API might not be running yet)
  }

  return {
    user: locals.user,
  };
};
