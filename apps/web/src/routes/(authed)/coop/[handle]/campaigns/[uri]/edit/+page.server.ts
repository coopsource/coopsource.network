import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ params, fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const uri = decodeURIComponent(params.uri);

  const campaign = await api.getCampaign(uri);

  if (campaign.status !== 'draft' && campaign.status !== 'active') {
    redirect(302, `/coop/${params.handle}/campaigns/${params.uri}`);
  }

  return { campaign };
};

export const actions: Actions = {
  default: async ({ request, fetch, params }) => {
    const data = await request.formData();
    const title = String(data.get('title') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const goalAmountDollars = parseFloat(String(data.get('goalAmount') ?? '0'));
    const goalCurrency = String(data.get('goalCurrency') ?? 'USD');
    const fundingModel = String(data.get('fundingModel') ?? 'all_or_nothing');
    const endDate = String(data.get('endDate') ?? '').trim();

    if (!title || goalAmountDollars <= 0) {
      return fail(400, { error: 'Title and goal amount are required.' });
    }

    const amountCents = Math.round(goalAmountDollars * 100);

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);

    try {
      await api.updateCampaign(decodeURIComponent(params.uri), {
        title,
        description: description || undefined,
        goalAmount: amountCents,
        goalCurrency,
        fundingModel,
        endDate: endDate || undefined,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Failed to update campaign.' });
    }

    redirect(302, `/coop/${params.handle}/campaigns/${params.uri}`);
  },
};
