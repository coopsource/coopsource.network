import type { PageServerLoad } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ params, fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const uri = decodeURIComponent(params.uri);

  const [campaign, pledgesResult] = await Promise.all([
    api.getCampaign(uri),
    api.getPledges(uri, { limit: 20 }),
  ]);

  return {
    campaign,
    pledges: pledgesResult.pledges,
    pledgesCursor: pledgesResult.cursor,
  };
};
