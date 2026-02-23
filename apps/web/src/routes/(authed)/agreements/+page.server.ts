import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const status = url.searchParams.get('status') ?? undefined;
  const cursor = url.searchParams.get('cursor') ?? undefined;

  try {
    const result = await api.getAgreements({ status, limit: 20, cursor });
    return { agreements: result.agreements, cursor: result.cursor, filterStatus: status ?? '' };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load agreements.');
    }
    error(500, 'Failed to load agreements.');
  }
};
