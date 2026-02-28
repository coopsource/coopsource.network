import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const cooperative = await api.getCooperative();
  return { cooperative };
};

export const actions: Actions = {
  update: async ({ request, fetch }) => {
    const data = await request.formData();
    const displayName = String(data.get('displayName') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const website = String(data.get('website') ?? '').trim();

    if (!displayName) {
      return fail(400, { error: 'Display name is required.' });
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      const cooperative = await api.updateCooperative({
        displayName,
        description: description || undefined,
        website: website || undefined,
      });
      return { success: true, cooperative };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Update failed. Please try again.' });
    }
  },
};
