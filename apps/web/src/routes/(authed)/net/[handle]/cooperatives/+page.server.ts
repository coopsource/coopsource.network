import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, parent }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const { workspace } = await parent();

  // V8.2 — workspace.cooperative is nullable. /net/[handle] only renders for
  // actual networks (the parent layout errors otherwise), so it's always
  // non-null in practice, but guard for type safety.
  if (!workspace.cooperative) {
    error(404, 'Network not found');
  }

  try {
    const result = await api.getNetworkMembers(workspace.cooperative.did, { limit: 50 });
    return { members: result.members, cursor: result.cursor };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load network members.');
    }
    error(500, 'Failed to load network members.');
  }
};
