import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ params, fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  try {
    const document = await api.getLegalDocument(params.id);
    return { document };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      error(404, 'Document not found.');
    }
    error(500, 'Failed to load document.');
  }
};

export const actions: Actions = {
  update: async ({ params, request, fetch }) => {
    const data = await request.formData();
    const title = String(data.get('title') ?? '').trim();
    const body = String(data.get('body') ?? '').trim();
    const documentType = String(data.get('documentType') ?? '').trim();
    const status = String(data.get('status') ?? '').trim();

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.updateLegalDocument(params.id, {
        title: title || undefined,
        body: body || undefined,
        documentType: documentType || undefined,
        status: status || undefined,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to update document.' });
    }
  },
};
