import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const result = await api.getLexicons();

  return {
    lexicons: result.lexicons,
  };
};

export const actions: Actions = {
  register: async ({ request, fetch }) => {
    const data = await request.formData();
    const nsid = String(data.get('nsid') ?? '').trim();
    const lexiconDocStr = String(data.get('lexiconDoc') ?? '').trim();
    const fieldMappingsStr = String(data.get('fieldMappings') ?? '').trim();

    if (!nsid) return fail(400, { error: 'NSID is required.' });
    if (!lexiconDocStr) return fail(400, { error: 'Lexicon document JSON is required.' });

    let lexiconDoc: Record<string, unknown>;
    try {
      lexiconDoc = JSON.parse(lexiconDocStr) as Record<string, unknown>;
    } catch {
      return fail(400, { error: 'Lexicon document must be valid JSON.' });
    }

    let fieldMappings: Record<string, unknown> | undefined;
    if (fieldMappingsStr) {
      try {
        fieldMappings = JSON.parse(fieldMappingsStr) as Record<string, unknown>;
      } catch {
        return fail(400, { error: 'Field mappings must be valid JSON.' });
      }
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.registerLexicon({ nsid, lexiconDoc, fieldMappings });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to register lexicon.' });
    }
  },

  remove: async ({ request, fetch }) => {
    const data = await request.formData();
    const nsid = String(data.get('nsid') ?? '').trim();

    if (!nsid) return fail(400, { error: 'NSID is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.deleteLexicon(nsid);
      return { deleteSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to remove lexicon.' });
    }
  },
};
