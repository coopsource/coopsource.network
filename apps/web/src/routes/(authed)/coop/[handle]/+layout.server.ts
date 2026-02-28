import { error } from '@sveltejs/kit';
import { createApiClient } from '$lib/api/client.js';
import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async ({ params, fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  try {
    const cooperative = await api.getCooperativeByHandle(params.handle);
    return {
      workspace: {
        type: 'coop' as const,
        handle: params.handle,
        prefix: `/coop/${params.handle}`,
        cooperative,
      },
    };
  } catch {
    error(404, 'Cooperative not found');
  }
};
