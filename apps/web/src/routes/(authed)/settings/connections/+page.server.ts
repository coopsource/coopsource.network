import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const [connectionsResult, servicesResult] = await Promise.all([
    api.getConnections(),
    api.getAvailableServices(),
  ]);

  return {
    connections: connectionsResult.connections,
    availableServices: servicesResult.services,
    connected: url.searchParams.get('connected') ?? null,
    error: url.searchParams.get('error') ?? null,
  };
};

export const actions: Actions = {
  connect: async ({ request, fetch }) => {
    const formData = await request.formData();
    const service = String(formData.get('service') ?? '');

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);

    try {
      const result = await api.initiateConnection(service);
      return { redirect: result.authUrl };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { actionError: err.message });
      }
      return fail(500, { actionError: 'Failed to initiate connection.' });
    }
  },

  disconnect: async ({ request, fetch }) => {
    const formData = await request.formData();
    const uri = String(formData.get('uri') ?? '');

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);

    try {
      await api.revokeConnection(uri);
      return { actionSuccess: 'Connection revoked.' };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { actionError: err.message });
      }
      return fail(500, { actionError: 'Failed to revoke connection.' });
    }
  },
};
