import type { PageServerLoad } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  try {
    const result = await api.getInvitations({ limit: 20 });
    return { invitations: result.invitations };
  } catch {
    return { invitations: [] };
  }
};
