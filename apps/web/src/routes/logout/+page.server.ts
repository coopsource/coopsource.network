import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const actions: Actions = {
  default: async ({ fetch, cookies, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.logout();
    } catch {
      // ignore — always clear and redirect
    }

    // Clear the session cookie in the browser
    cookies.delete('connect.sid', { path: '/' });

    redirect(302, '/login');
  },
};
