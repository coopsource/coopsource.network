import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const [map, interestsResult] = await Promise.all([
    api.getMap(),
    api.getInterests(),
  ]);

  return {
    map,
    stakeholderCount: interestsResult.interests.length,
  };
};

export const actions: Actions = {
  generate: async ({ request, fetch }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);

    try {
      await api.generateMap();
      return { success: true };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Failed to generate map' });
    }
  },
};
