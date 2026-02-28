import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const actions: Actions = {
  default: async ({ request, fetch, params }) => {
    const data = await request.formData();
    const title = String(data.get('title') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const tier = String(data.get('tier') ?? 'cooperative');
    const campaignType = String(data.get('campaignType') ?? 'donation');
    const goalAmountDollars = parseFloat(String(data.get('goalAmount') ?? '0'));
    const goalCurrency = String(data.get('goalCurrency') ?? 'USD');
    const fundingModel = String(data.get('fundingModel') ?? 'all_or_nothing');
    const endDate = String(data.get('endDate') ?? '').trim();

    if (!title || goalAmountDollars <= 0) {
      return fail(400, { error: 'Title and goal amount are required.' });
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);

    try {
      const campaign = await api.createCampaign({
        beneficiaryUri: 'self',
        title,
        description: description || undefined,
        tier,
        campaignType,
        goalAmount: Math.round(goalAmountDollars * 100),
        goalCurrency,
        fundingModel,
        endDate: endDate || undefined,
      });

      redirect(302, `/coop/${params.handle}/campaigns/${encodeURIComponent(campaign.uri)}`);
    } catch (err) {
      if (err instanceof Error && 'status' in err) {
        return fail(400, { error: err.message });
      }
      throw err;
    }
  },
};
