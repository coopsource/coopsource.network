import type { PageServerLoad } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const status = url.searchParams.get('status') ?? undefined;
  const cursor = url.searchParams.get('cursor') ?? undefined;

  const result = await api.getCampaigns({ status, limit: 20, cursor });

  return {
    campaigns: result.campaigns,
    cursor: result.cursor,
    filterStatus: status ?? '',
  };
};
