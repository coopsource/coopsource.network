import type { PageServerLoad } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const [myInterests, outcomesResult, map] = await Promise.all([
    api.getMyInterests(),
    api.listOutcomes({ limit: 5 }),
    api.getMap(),
  ]);

  return {
    myInterests,
    outcomes: outcomesResult.outcomes,
    outcomesCursor: outcomesResult.cursor,
    map,
  };
};
