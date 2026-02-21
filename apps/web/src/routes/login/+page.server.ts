import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';
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
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');

    if (!email || !password) {
      return fail(400, { error: 'Email and password are required.' });
    }

    const api = createApiClient(fetch);
    const res = await api.loginRaw({ email, password });

    if (!res.ok) {
      if (res.status === 401) {
        return fail(401, { error: 'Invalid email or password.' });
      }
      let msg = `Error ${res.status}`;
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
