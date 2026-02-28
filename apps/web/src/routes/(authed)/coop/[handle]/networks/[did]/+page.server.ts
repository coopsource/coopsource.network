import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ params, fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  try {
    const [network, membersData] = await Promise.all([
      api.getNetwork(params.did),
      api.getNetworkMembers(params.did, { limit: 50 }),
    ]);
    return { network, members: membersData.members, membersCursor: membersData.cursor };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      error(404, 'Network not found.');
    }
    error(500, 'Failed to load network.');
  }
};

export const actions: Actions = {
  join: async ({ params, request, fetch }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.joinNetwork(params.did);
      return { joinSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Failed to join network.' });
    }
  },

  leave: async ({ params, request, fetch }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.leaveNetwork(params.did);
      return { leaveSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Failed to leave network.' });
    }
  },
};
