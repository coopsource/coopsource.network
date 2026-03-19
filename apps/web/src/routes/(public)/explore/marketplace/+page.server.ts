import { createApiClient } from '$lib/api/client.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ fetch, url }) => {
  const api = createApiClient(fetch);
  const category = url.searchParams.get('category') ?? undefined;
  const location = url.searchParams.get('location') ?? undefined;
  const query = url.searchParams.get('q') ?? undefined;
  const cursor = url.searchParams.get('cursor') ?? undefined;

  const results = await api.searchCommerceListings({
    category,
    location,
    query,
    limit: 24,
    cursor,
  }).catch(() => ({ items: [], cursor: null }));

  return {
    listings: results.items,
    cursor: results.cursor,
    filterCategory: category ?? '',
    filterLocation: location ?? '',
    filterQuery: query ?? '',
  };
};
