import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
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

export const actions: Actions = {
  updateStatus: async ({ params, request, fetch }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const uri = decodeURIComponent(params.uri);
    const data = await request.formData();
    const status = String(data.get('status') ?? '');

    try {
      await api.updateCampaignStatus(uri, status);
      return { success: true };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Failed' });
    }
  },

  pledge: async ({ params, request, fetch }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const uri = decodeURIComponent(params.uri);
    const data = await request.formData();
    const amountDollars = parseFloat(String(data.get('amount') ?? '0'));

    if (amountDollars <= 0) {
      return fail(400, { pledgeError: 'Amount must be positive' });
    }

    try {
      await api.createPledge(uri, {
        amount: Math.round(amountDollars * 100),
        currency: 'USD',
      });
      return { pledgeSuccess: true };
    } catch (err) {
      return fail(400, { pledgeError: err instanceof Error ? err.message : 'Failed' });
    }
  },
};
