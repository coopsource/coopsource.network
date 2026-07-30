import { error } from '@sveltejs/kit';
import { createApiClient, ApiError } from '$lib/api/client.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ fetch, url }) => {
  const api = createApiClient(fetch);
  const category = url.searchParams.get('category') ?? undefined;
  const location = url.searchParams.get('location') ?? undefined;
  const query = url.searchParams.get('q') ?? undefined;
  const cursor = url.searchParams.get('cursor') ?? undefined;

  try {
    const results = await api.searchCommerceListings({
      category,
      location,
      query,
      limit: 24,
      cursor,
    });

    return {
      listings: results.listings,
      cursor: results.cursor,
      filterCategory: category ?? '',
      filterLocation: location ?? '',
      filterQuery: query ?? '',
    };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load marketplace listings.');
    }
    error(500, 'Failed to load marketplace listings.');
  }
};
