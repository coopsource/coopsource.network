import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const category = url.searchParams.get('category') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;

  try {
    const result = await api.getCommerceListings({ category, status, limit: 50 });
    return {
      listings: result.items,
      cursor: result.cursor,
      filterCategory: category ?? '',
      filterStatus: status ?? '',
    };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load listings.');
    }
    error(500, 'Failed to load listings.');
  }
};

export const actions: Actions = {
  createListing: async ({ request, fetch }) => {
    const formData = await request.formData();
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const category = String(formData.get('category') ?? '').trim();
    const availability = String(formData.get('availability') ?? 'available').trim();
    const location = String(formData.get('location') ?? '').trim();
    const tagsStr = String(formData.get('tags') ?? '').trim();

    if (!title) return fail(400, { error: 'Title is required.' });
    if (!category) return fail(400, { error: 'Category is required.' });

    const tags = tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : undefined;

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createCommerceListing({
        title,
        description: description || undefined,
        category,
        availability,
        location: location || undefined,
        tags,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create listing.' });
    }
  },

  updateListing: async ({ request, fetch }) => {
    const formData = await request.formData();
    const id = String(formData.get('id') ?? '').trim();
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const category = String(formData.get('category') ?? '').trim();
    const availability = String(formData.get('availability') ?? '').trim();
    const location = String(formData.get('location') ?? '').trim();
    const tagsStr = String(formData.get('tags') ?? '').trim();

    if (!id || !title) return fail(400, { error: 'ID and title are required.' });

    const tags = tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : undefined;

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.updateCommerceListing(id, {
        title,
        description: description || undefined,
        category,
        availability,
        location: location || undefined,
        tags,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to update listing.' });
    }
  },

  deleteListing: async ({ request, fetch }) => {
    const formData = await request.formData();
    const id = String(formData.get('id') ?? '');

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.deleteCommerceListing(id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to delete listing.' });
    }
  },
};
