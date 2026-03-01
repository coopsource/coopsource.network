import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const [providersResult, supportedResult] = await Promise.all([
    api.getModelProviders(),
    api.getSupportedModelProviders(),
  ]);
  return {
    providers: providersResult.providers,
    supported: supportedResult.providers,
  };
};

export const actions: Actions = {
  add: async ({ request, fetch }) => {
    const data = await request.formData();
    const providerId = String(data.get('providerId') ?? '').trim();
    const displayName = String(data.get('displayName') ?? '').trim();
    const apiKey = String(data.get('apiKey') ?? '').trim();
    const baseUrl = String(data.get('baseUrl') ?? '').trim();

    if (!providerId || !displayName) {
      return fail(400, { error: 'Provider and name are required.' });
    }

    const credentials: Record<string, string> = {};
    if (providerId === 'anthropic' && apiKey) credentials.apiKey = apiKey;
    if (providerId === 'ollama') credentials.baseUrl = baseUrl || 'http://localhost:11434';

    if (providerId === 'anthropic' && !apiKey) {
      return fail(400, { error: 'API key is required for Anthropic.' });
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.addModelProvider({ providerId, displayName, credentials });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to add provider.' });
    }
  },

  remove: async ({ request, fetch }) => {
    const data = await request.formData();
    const providerId = String(data.get('providerId') ?? '').trim();

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.removeModelProvider(providerId);
      return { deleteSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to remove provider.' });
    }
  },
};
