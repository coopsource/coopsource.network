import { redirect, fail, isRedirect } from '@sveltejs/kit';
import type { Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const actions: Actions = {
  default: async ({ request, fetch, params }) => {
    const data = await request.formData();
    const title = String(data.get('title') ?? '').trim();
    const body = String(data.get('body') ?? '').trim();
    const documentType = String(data.get('documentType') ?? '').trim();
    const status = String(data.get('status') ?? 'draft').trim();

    if (!title) return fail(400, { error: 'Title is required.' });
    if (!documentType) return fail(400, { error: 'Document type is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      const doc = await api.createLegalDocument({ title, body: body || undefined, documentType, status });
      redirect(303, `/coop/${params.handle}/legal/${doc.id}`);
    } catch (err) {
      if (isRedirect(err)) throw err;
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create document.' });
    }
  },
};
