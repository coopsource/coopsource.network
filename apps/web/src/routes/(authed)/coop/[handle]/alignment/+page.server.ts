import type { PageServerLoad } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const [myInterestsResult, outcomesResult, mapResult] = await Promise.allSettled([
    api.getMyInterests(),
    api.listOutcomes({ limit: 5 }),
    api.getMap(),
  ]);

  return {
    myInterests: myInterestsResult.status === 'fulfilled' ? myInterestsResult.value : null,
    outcomes: outcomesResult.status === 'fulfilled' ? outcomesResult.value.outcomes : [],
    outcomesCursor: outcomesResult.status === 'fulfilled' ? outcomesResult.value.cursor : undefined,
    map: mapResult.status === 'fulfilled' ? mapResult.value : null,
  };
};
