import { error } from '@sveltejs/kit';
import { createApiClient, ApiError } from '$lib/api/client.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ fetch, params, request, locals }) => {
  // V8.5: Forward the cookie so authed viewers can also reach /me/memberships
  // server-side (without it, authed users would get 401 and the member banner
  // would never render).
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  let cooperative;
  try {
    cooperative = await api.getExploreCooperative(params.handle);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      error(404, 'Cooperative not found');
    }
    throw err;
  }

  // V8.5: Check whether the viewer is an active member of this co-op.
  // Only authed users can be members; gating on locals.user avoids one round-trip
  // for every anon page view. Defensive try/catch in case the call fails for any
  // reason — the banner is a nice-to-have, not load-bearing.
  let isMember = false;
  if (locals.user) {
    try {
      const me = await api.getMyMemberships();
      isMember = me.cooperatives.some((c) => c.did === cooperative.did);
    } catch {
      // Leave isMember = false; banner just doesn't render.
    }
  }

  return { cooperative, isMember };
};
