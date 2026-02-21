import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) {
    redirect(302, '/dashboard');
  }
  return {};
};

export const actions: Actions = {
  default: async ({ request, fetch }) => {
    const data = await request.formData();
    const displayName = String(data.get('displayName') ?? '').trim();
    const handle = String(data.get('handle') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');

    if (!displayName || !handle || !email || !password) {
      return fail(400, { error: 'All fields are required.' });
    }

    const api = createApiClient(fetch);
    try {
      await api.register({ displayName, handle, email, password });
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Registration failed. Please try again.' });
    }

    redirect(302, '/dashboard');
  },
};
