import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient } from '$lib/api/client.js';
import { forwardSessionCookie } from '$lib/server/cookies.js';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) {
    redirect(302, '/dashboard');
  }
  return {};
};

export const actions: Actions = {
  default: async ({ request, fetch, cookies }) => {
    const data = await request.formData();
    const displayName = String(data.get('displayName') ?? '').trim();
    const handle = String(data.get('handle') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');

    if (!displayName || !handle || !email || !password) {
      return fail(400, { error: 'All fields are required.' });
    }

    const api = createApiClient(fetch);
    const res = await api.registerRaw({ displayName, handle, email, password });

    if (!res.ok) {
      let msg = 'Registration failed. Please try again.';
      try {
        const body = (await res.json()) as { message?: string; error?: string };
        msg = body.message ?? body.error ?? msg;
      } catch { /* ignore */ }
      return fail(res.status, { error: msg });
    }

    forwardSessionCookie(res, cookies);
    redirect(302, '/dashboard');
  },
};
