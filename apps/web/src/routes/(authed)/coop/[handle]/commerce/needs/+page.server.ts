import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const category = url.searchParams.get('category') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;

  try {
    const result = await api.getCommerceNeeds({ category, status, limit: 50 });
    return {
      needs: result.items,
      cursor: result.cursor,
      filterCategory: category ?? '',
      filterStatus: status ?? '',
    };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load needs.');
    }
    error(500, 'Failed to load needs.');
  }
};

export const actions: Actions = {
  createNeed: async ({ request, fetch }) => {
    const formData = await request.formData();
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const category = String(formData.get('category') ?? '').trim();
    const urgency = String(formData.get('urgency') ?? 'normal').trim();
    const tagsStr = String(formData.get('tags') ?? '').trim();

    if (!title) return fail(400, { error: 'Title is required.' });
    if (!category) return fail(400, { error: 'Category is required.' });

    const tags = tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : undefined;

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createCommerceNeed({
        title,
        description: description || undefined,
        category,
        urgency,
        tags,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create need.' });
    }
  },

  deleteNeed: async ({ request, fetch }) => {
    const formData = await request.formData();
    const id = String(formData.get('id') ?? '');

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.deleteCommerceNeed(id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to delete need.' });
    }
  },
};
