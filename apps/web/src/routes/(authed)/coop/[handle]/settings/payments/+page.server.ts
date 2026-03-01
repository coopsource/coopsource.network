import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const [configsResult, supportedResult] = await Promise.all([
    api.getPaymentConfigs().catch(() => ({ providers: [] })),
    api.getSupportedProviders().catch(() => ({ providers: [] })),
  ]);

  return {
    configs: configsResult.providers,
    supportedProviders: supportedResult.providers,
  };
};

export const actions: Actions = {
  add: async ({ request, fetch }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const data = await request.formData();

    const providerId = String(data.get('providerId') ?? '');
    const displayName = String(data.get('displayName') ?? '');
    const secretKey = String(data.get('secretKey') ?? '');
    const webhookSecret = String(data.get('webhookSecret') ?? '');

    if (!providerId || !displayName || !secretKey) {
      return fail(400, { error: 'All fields are required' });
    }

    try {
      await api.addPaymentConfig({
        providerId,
        displayName,
        credentials: { secretKey },
        webhookSecret: webhookSecret || undefined,
      });
      return { success: true };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Failed to add provider' });
    }
  },

  toggle: async ({ request, fetch }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const data = await request.formData();

    const providerId = String(data.get('providerId') ?? '');
    const enabled = data.get('enabled') === 'true';

    try {
      await api.updatePaymentConfig(providerId, { enabled });
      return { success: true };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Failed' });
    }
  },

  remove: async ({ request, fetch }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const data = await request.formData();
    const providerId = String(data.get('providerId') ?? '');

    try {
      await api.deletePaymentConfig(providerId);
      return { success: true };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Failed' });
    }
  },
};
