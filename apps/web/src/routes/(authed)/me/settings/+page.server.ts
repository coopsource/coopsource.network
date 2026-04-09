import type { Actions, PageServerLoad } from './$types.js';
import { fail } from '@sveltejs/kit';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  // V8.8 — fetch the user's default profile so we can show the discoverability
  // toggle. Newly-registered users without a profile fall back to a null
  // profile / discoverable=false; the PATCH endpoint is a no-op for them.
  const profileResult = await api.getMyProfile().catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      return { profile: null };
    }
    throw e;
  });

  return {
    profile: profileResult.profile,
    discoverable: profileResult.profile?.discoverable ?? false,
  };
};

export const actions: Actions = {
  setDiscoverable: async ({ fetch, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const data = await request.formData();
    const discoverable = data.get('discoverable') === 'on';
    try {
      const result = await api.setMyDiscoverable(discoverable);
      return { success: true, discoverable: result.discoverable };
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        return fail(e.status, { error: e.message, discoverable: !discoverable });
      }
      throw e;
    }
  },
};
