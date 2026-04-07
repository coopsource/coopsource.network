import { error } from '@sveltejs/kit';
import { createApiClient } from '$lib/api/client.js';
import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async ({ params, fetch, request, locals }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  try {
    const cooperative = await api.getCooperativeByHandle(params.handle);

    // Fetch user's roles for THIS cooperative (not from locals.user which may be scoped to a different coop)
    let userRoles: string[] = [];
    if (locals.user) {
      try {
        const member = await api.getMember(locals.user.did);
        userRoles = member.roles;
      } catch {
        // User may not be a member of this cooperative
      }
    }

    return {
      workspace: {
        type: 'coop' as const,
        handle: params.handle,
        prefix: `/coop/${params.handle}`,
        cooperative,
        userRoles,
      },
    };
  } catch {
    error(404, 'Cooperative not found');
  }
};
