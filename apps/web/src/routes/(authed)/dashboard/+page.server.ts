import type { PageServerLoad } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const [coopResult, proposalsResult, agreementsResult, threadsResult, campaignsResult, outcomesResult] = await Promise.allSettled([
    api.getCooperative(),
    api.getProposals({ limit: 5 }),
    api.getAgreements({ limit: 5 }),
    api.getThreads({ limit: 5 }),
    api.getCampaigns({ limit: 5 }),
    api.listOutcomes({ limit: 5 }),
  ]);

  return {
    cooperative: coopResult.status === 'fulfilled' ? coopResult.value : null,
    proposals: proposalsResult.status === 'fulfilled' ? proposalsResult.value.proposals : [],
    agreements: agreementsResult.status === 'fulfilled' ? agreementsResult.value.agreements : [],
    threads: threadsResult.status === 'fulfilled' ? threadsResult.value.threads : [],
    campaigns: campaignsResult.status === 'fulfilled' ? campaignsResult.value.campaigns : [],
    outcomes: outcomesResult.status === 'fulfilled' ? outcomesResult.value.outcomes : [],
  };
};
