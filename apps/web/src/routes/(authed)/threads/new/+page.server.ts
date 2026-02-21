import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async () => {
  return {};
};

export const actions: Actions = {
  default: async ({ request, fetch }) => {
    const data = await request.formData();
    const title = String(data.get('title') ?? '').trim();
    const threadType = String(data.get('threadType') ?? 'discussion').trim();

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    let thread;
    try {
      thread = await api.createThread({
        title: title || undefined,
        threadType,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Failed to create thread.' });
    }

    redirect(302, `/threads/${thread.id}`);
  },
};
