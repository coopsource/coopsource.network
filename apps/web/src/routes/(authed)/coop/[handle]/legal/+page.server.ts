import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const status = url.searchParams.get('status') ?? undefined;
  const documentType = url.searchParams.get('documentType') ?? undefined;
  const cursor = url.searchParams.get('cursor') ?? undefined;

  const result = await api.getLegalDocuments({ status, documentType, limit: 20, cursor });
  return {
    documents: result.documents,
    cursor: result.cursor,
    filterStatus: status ?? '',
    filterType: documentType ?? '',
  };
};

export const actions: Actions = {
  create: async ({ request, fetch }) => {
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
      return { success: true, documentId: doc.id };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create document.' });
    }
  },
};
