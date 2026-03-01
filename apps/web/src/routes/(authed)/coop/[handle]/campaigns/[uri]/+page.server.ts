import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ params, fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const uri = decodeURIComponent(params.uri);

  const [campaign, pledgesResult, providersResult] = await Promise.all([
    api.getCampaign(uri),
    api.getPledges(uri, { limit: 20 }),
    api.getPaymentProviders(uri).catch(() => ({ providers: [] })),
  ]);

  return {
    campaign,
    pledges: pledgesResult.pledges,
    pledgesCursor: pledgesResult.cursor,
    paymentProviders: providersResult.providers,
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

  pledge: async ({ params, request, fetch, url }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const uri = decodeURIComponent(params.uri);
    const data = await request.formData();
    const amountDollars = parseFloat(String(data.get('amount') ?? '0'));
    const providerId = String(data.get('providerId') ?? '');

    if (amountDollars <= 0) {
      return fail(400, { pledgeError: 'Amount must be positive' });
    }

    try {
      const pledge = await api.createPledge(uri, {
        amount: Math.round(amountDollars * 100),
        currency: 'USD',
      });

      // If a payment provider was selected, create checkout session
      if (providerId) {
        const campaignPageUrl = `${url.origin}/coop/${params.handle}/campaigns/${encodeURIComponent(uri)}`;
        const successUrl = `${campaignPageUrl}?payment=success`;
        const cancelUrl = `${campaignPageUrl}?payment=cancelled`;

        const checkout = await api.createCheckout(
          uri,
          pledge.uri,
          providerId,
          successUrl,
          cancelUrl,
        );

        return { checkoutUrl: checkout.checkoutUrl };
      }

      // No provider selected — offline/manual pledge
      return { pledgeSuccess: true, offlineMode: true };
    } catch (err) {
      return fail(400, { pledgeError: err instanceof Error ? err.message : 'Failed' });
    }
  },
};
