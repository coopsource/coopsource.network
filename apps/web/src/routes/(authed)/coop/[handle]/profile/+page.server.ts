import type { PageServerLoad } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const [membershipsResult, invitationsResult] = await Promise.allSettled([
    api.getMyMemberships(),
    api.getInvitations({ limit: 20 }),
  ]);

  return {
    cooperatives: membershipsResult.status === 'fulfilled' ? membershipsResult.value.cooperatives : [],
    networks: membershipsResult.status === 'fulfilled' ? membershipsResult.value.networks : [],
    invitations: invitationsResult.status === 'fulfilled' ? invitationsResult.value.invitations : [],
  };
};
