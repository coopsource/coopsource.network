import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const resourceType = url.searchParams.get('resourceType') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;

  try {
    const result = await api.getSharedResources({ resourceType, status, limit: 50 });
    return {
      resources: result.items,
      cursor: result.cursor,
      filterResourceType: resourceType ?? '',
      filterStatus: status ?? '',
    };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load shared resources.');
    }
    error(500, 'Failed to load shared resources.');
  }
};

export const actions: Actions = {
  createResource: async ({ request, fetch }) => {
    const formData = await request.formData();
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const resourceType = String(formData.get('resourceType') ?? '').trim();
    const location = String(formData.get('location') ?? '').trim();
    const costPerUnitStr = String(formData.get('costPerUnit') ?? '').trim();
    const costUnit = String(formData.get('costUnit') ?? '').trim();

    if (!title) return fail(400, { error: 'Title is required.' });
    if (!resourceType) return fail(400, { error: 'Resource type is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createSharedResource({
        title,
        description: description || undefined,
        resourceType,
        location: location || undefined,
        costPerUnit: costPerUnitStr ? Number(costPerUnitStr) : undefined,
        costUnit: costUnit || undefined,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create resource.' });
    }
  },

  bookResource: async ({ request, fetch }) => {
    const formData = await request.formData();
    const resourceId = String(formData.get('resourceId') ?? '').trim();
    const startsAt = String(formData.get('startsAt') ?? '').trim();
    const endsAt = String(formData.get('endsAt') ?? '').trim();
    const purpose = String(formData.get('purpose') ?? '').trim();

    if (!resourceId || !startsAt || !endsAt) {
      return fail(400, { error: 'Resource, start time, and end time are required.' });
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createResourceBooking(resourceId, {
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        purpose: purpose || undefined,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to book resource.' });
    }
  },
};
