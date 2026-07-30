import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  try {
    const [listings, needs, agreements, projects] = await Promise.all([
      api.getCommerceListings({ limit: 1 }),
      api.getCommerceNeeds({ limit: 1 }),
      api.getIntercoopAgreements({ limit: 1 }),
      api.getCollaborativeProjects({ limit: 1 }),
    ]);

    return {
      listingsCount: listings.listings.length,
      needsCount: needs.needs.length,
      agreementsCount: agreements.agreements.length,
      projectsCount: projects.projects.length,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load commerce overview.');
    }
    error(500, 'Failed to load commerce overview.');
  }
};
