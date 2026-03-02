import type { PageServerLoad } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  try {
    const result = await api.getNotifications({ limit: 25 });
    return { notifications: result.notifications, cursor: result.cursor };
  } catch {
    return { notifications: [], cursor: undefined };
  }
};
