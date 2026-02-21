import { redirect, fail, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';
import { forwardSessionCookie } from '$lib/server/cookies.js';

export const load: PageServerLoad = async ({ params, fetch }) => {
  const api = createApiClient(fetch);
  try {
    const invitation = await api.getInvitation(params.token);
    return { invitation };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      error(404, 'Invitation not found or has expired.');
    }
    error(500, 'Failed to load invitation.');
  }
};

export const actions: Actions = {
  accept: async ({ request, params, fetch, cookies }) => {
    const data = await request.formData();
    const displayName = String(data.get('displayName') ?? '').trim();
    const handle = String(data.get('handle') ?? '').trim();
    const password = String(data.get('password') ?? '');

    if (!displayName || !password) {
      return fail(400, { error: 'Display name and password are required.' });
    }

    const api = createApiClient(fetch);
    const res = await api.acceptInvitationRaw(params.token, { displayName, handle, password });

    if (!res.ok) {
      let msg = 'Failed to accept invitation. Please try again.';
      try {
        const body = (await res.json()) as { message?: string; error?: string };
        msg = body.message ?? body.error ?? msg;
      } catch { /* ignore */ }
      return fail(res.status, { error: msg });
    }

    // Forward session cookie — the API logs the new member in on acceptance
    forwardSessionCookie(res, cookies);
    redirect(302, '/dashboard');
  },
};
