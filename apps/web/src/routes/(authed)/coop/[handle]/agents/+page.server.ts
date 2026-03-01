import type { PageServerLoad } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const result = await api.getAgents();
  return { agents: result.agents };
};
