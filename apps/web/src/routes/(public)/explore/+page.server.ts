import { createApiClient } from '$lib/api/client.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ fetch, url }) => {
  const api = createApiClient(fetch);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const cursor = url.searchParams.get('cursor') ?? undefined;

  // V8.6: when ?q= is set, swap the cooperatives source for the search endpoint.
  // The networks strip stays as-is in browse mode and is hidden in search mode
  // by the page.svelte (visual focus).
  if (q) {
    const [cooperatives, networks] = await Promise.all([
      api.searchCooperatives(q, { limit: 20, cursor }),
      api.getExploreNetworks({ limit: 10 }),
    ]);
    return { cooperatives, networks, q };
  }

  const [cooperatives, networks] = await Promise.all([
    api.getExploreCooperatives({ limit: 20, cursor }),
    api.getExploreNetworks({ limit: 10 }),
  ]);

  return { cooperatives, networks, q: '' };
};
