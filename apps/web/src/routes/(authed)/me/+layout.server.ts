import { createApiClient } from '$lib/api/client.js';
import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  // Load myMemberships for the workspace switcher dropdown AND for the Home page cards.
  // Fail gracefully — empty arrays are fine for new users.
  let cooperatives: Awaited<ReturnType<typeof api.getMyMemberships>>['cooperatives'] = [];
  let networks: typeof cooperatives = [];
  try {
    const result = await api.getMyMemberships();
    cooperatives = result.cooperatives;
    networks = result.networks;
  } catch {
    // Empty arrays
  }

  return {
    workspace: {
      type: 'home' as const,
      handle: 'me',
      prefix: '/me',
      cooperative: null,
      userRoles: [],
    },
    // myCoops includes both cooperatives AND networks (the workspace switcher
    // shows all entities the user belongs to, regardless of is_network).
    myCoops: [...cooperatives, ...networks],
  };
};
