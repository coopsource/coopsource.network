import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const [hooksResult, deadLettersResult] = await Promise.all([
    api.getHooks(),
    api.getDeadLetters({ limit: 50 }),
  ]);

  return {
    hooks: hooksResult.hooks,
    health: hooksResult.health,
    deadLetters: deadLettersResult.entries,
    deadLetterCursor: deadLettersResult.cursor,
  };
};

export const actions: Actions = {
  resolve: async ({ request, fetch }) => {
    const data = await request.formData();
    const id = String(data.get('id') ?? '').trim();

    if (!id) return fail(400, { error: 'Dead letter ID is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.resolveDeadLetter(id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to resolve dead letter.' });
    }
  },
};
