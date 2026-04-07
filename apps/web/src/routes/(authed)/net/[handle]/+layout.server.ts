import { error } from '@sveltejs/kit';
import { createApiClient } from '$lib/api/client.js';
import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async ({ params, fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  try {
    const cooperative = await api.getCooperativeByHandle(params.handle);
    if (!cooperative.isNetwork) {
      error(404, 'Network not found');
    }
    return {
      workspace: {
        // V8.1 — networks use the 'coop' workspace type now; the sidebar
        // reads `cooperative.isNetwork` to drive label variations
        // (e.g., "Members" → "Cooperatives").
        type: 'coop' as const,
        handle: params.handle,
        prefix: `/net/${params.handle}`,
        cooperative,
      },
    };
  } catch {
    error(404, 'Network not found');
  }
};
