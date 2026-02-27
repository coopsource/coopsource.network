import { createApiClient } from '$lib/api/client.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ fetch, url }) => {
  const api = createApiClient(fetch);
  const cursor = url.searchParams.get('cursor') ?? undefined;

  const [cooperatives, networks] = await Promise.all([
    api.getExploreCooperatives({ limit: 20, cursor }),
    api.getExploreNetworks({ limit: 10 }),
  ]);

  return { cooperatives, networks };
};
