import { error } from '@sveltejs/kit';
import { createApiClient, ApiError } from '$lib/api/client.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ fetch, params }) => {
  const api = createApiClient(fetch);

  try {
    const cooperative = await api.getExploreCooperative(params.handle);
    return { cooperative };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      error(404, 'Cooperative not found');
    }
    throw err;
  }
};
