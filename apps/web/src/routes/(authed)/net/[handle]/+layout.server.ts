import { error } from '@sveltejs/kit';
import { createApiClient, ApiError } from '$lib/api/client.js';
import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async ({ params, fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  let cooperative: Awaited<ReturnType<typeof api.getCooperativeByHandle>>;
  try {
    cooperative = await api.getCooperativeByHandle(params.handle);
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load network.');
    }
    error(500, 'Failed to load network.');
  }

  if (!cooperative.isNetwork) {
    error(404, 'Network not found');
  }

  let memberships: Awaited<ReturnType<typeof api.getMyMemberships>>;
  try {
    memberships = await api.getMyMemberships();
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to verify network membership.');
    }
    error(500, 'Failed to verify network membership.');
  }

  if (!memberships.networks.some((network) => network.did === cooperative.did)) {
    error(403, 'Network membership required');
  }

  return {
    workspace: {
      type: 'network' as const,
      handle: params.handle,
      prefix: `/net/${params.handle}`,
      cooperative,
    },
    myCoops: [...memberships.cooperatives, ...memberships.networks],
  };
};
