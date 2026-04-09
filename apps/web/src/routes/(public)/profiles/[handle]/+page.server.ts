import type { PageServerLoad } from './$types.js';
import { error } from '@sveltejs/kit';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ params, fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  try {
    const person = await api.getExplorePerson(params.handle);
    return { person };
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 404) {
      error(404, 'Person not found');
    }
    throw e;
  }
};
