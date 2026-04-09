import type { Actions, PageServerLoad } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const include = url.searchParams.get('show') === 'all' ? 'all' : 'active';

  try {
    const result = await api.getMyMatches({ limit: 50, include });
    return { matches: result.matches, include };
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 401) {
      return { matches: [], include };
    }
    throw e;
  }
};

export const actions: Actions = {
  dismiss: async ({ fetch, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    if (!id) return { success: false };
    await api.dismissMatch(id);
    return { success: true };
  },
  act: async ({ fetch, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    if (!id) return { success: false };
    await api.actOnMatch(id);
    return { success: true };
  },
};
