import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const actions: Actions = {
  default: async ({ request, fetch }) => {
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();

    if (!name) {
      return fail(400, { error: 'Network name is required.' });
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    let result;
    try {
      result = await api.createNetwork({
        name,
        description: description || undefined,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Failed to create network.' });
    }

    redirect(302, `/networks/${encodeURIComponent(result.did)}`);
  },
};
