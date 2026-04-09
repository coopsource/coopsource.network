import type { Actions, PageServerLoad } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  // Fetch invitations, matches, and profile in parallel. All fail-safe to
  // sensible defaults for newly-registered users (no membership → 401 from
  // /me/matches; the existing invitations loader has been swallowing all
  // errors since V8.2).
  const [invitationsResult, matchesResult, profileResult] = await Promise.all([
    api.getInvitations({ limit: 20 }).catch(() => ({ invitations: [] })),
    api.getMyMatches({ limit: 5 }).catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 401) return { matches: [] };
      throw e;
    }),
    api.getMyProfile().catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 401) return { profile: null };
      throw e;
    }),
  ]);

  return {
    invitations: invitationsResult.invitations,
    matches: matchesResult.matches,
    dismissedGetStarted: profileResult.profile?.dismissedGetStarted ?? false,
  };
};

export const actions: Actions = {
  dismissMatch: async ({ fetch, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    if (!id) return { success: false };
    await api.dismissMatch(id);
    return { success: true };
  },

  dismissGetStarted: async ({ fetch, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    await api.dismissGetStarted();
    return { success: true };
  },
};
