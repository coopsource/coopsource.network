import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ params, fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const uri = decodeURIComponent(params.uri);

  const outcome = await api.getOutcome(uri);

  return { outcome };
};

export const actions: Actions = {
  support: async ({ params, request, fetch }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const uri = decodeURIComponent(params.uri);
    const data = await request.formData();
    const level = String(data.get('level') ?? 'neutral');
    const conditions = String(data.get('conditions') ?? '').trim() || undefined;

    try {
      await api.supportOutcome(uri, { level, conditions });
      return { success: true };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Failed' });
    }
  },
};
