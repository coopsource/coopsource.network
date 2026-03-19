import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  try {
    const [listings, needs, agreements, projects] = await Promise.all([
      api.getCommerceListings({ limit: 1 }).catch(() => ({ items: [], cursor: null })),
      api.getCommerceNeeds({ limit: 1 }).catch(() => ({ items: [], cursor: null })),
      api.getIntercoopAgreements({ limit: 1 }).catch(() => ({ items: [], cursor: null })),
      api.getCollaborativeProjects({ limit: 1 }).catch(() => ({ items: [], cursor: null })),
    ]);

    return {
      listingsCount: listings.items.length,
      needsCount: needs.items.length,
      agreementsCount: agreements.items.length,
      projectsCount: projects.items.length,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load commerce overview.');
    }
    error(500, 'Failed to load commerce overview.');
  }
};
