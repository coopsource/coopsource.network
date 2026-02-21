import { redirect } from '@sveltejs/kit';
import { createApiClient } from '$lib/api/client.js';
import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async ({ locals, fetch, request }) => {
  if (!locals.user) {
    redirect(302, '/login');
  }

  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  let cooperative = null;
  try {
    cooperative = await api.getCooperative();
  } catch {
    // Co-op may not exist yet during edge cases
  }

  return { user: locals.user, cooperative };
};
