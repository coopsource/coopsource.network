import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const result = await api.getInvitations({ limit: 20, cursor });
  return { invitations: result.invitations, cursor: result.cursor };
};

export const actions: Actions = {
  revoke: async ({ request, fetch }) => {
    const data = await request.formData();
    const id = String(data.get('id') ?? '').trim();

    if (!id) {
      return fail(400, { error: 'Missing invitation ID.' });
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.revokeInvitation(id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Failed to revoke invitation.' });
    }
  },
};
