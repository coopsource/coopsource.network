import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const status = url.searchParams.get('status') ?? undefined;

  const [links, partners] = await Promise.all([
    api.getCooperativeLinks({ status, limit: 50 }),
    api.getPartners().catch(() => ({ partners: [] })),
  ]);

  return {
    links: links.links,
    partners: partners.partners,
    filterStatus: status ?? '',
  };
};

export const actions: Actions = {
  create: async ({ request, fetch }) => {
    const data = await request.formData();
    const targetDid = String(data.get('targetDid') ?? '').trim();
    const linkType = String(data.get('linkType') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();

    if (!targetDid) return fail(400, { error: 'Target DID is required.' });
    if (!linkType) return fail(400, { error: 'Link type is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createCooperativeLink({ targetDid, linkType, description: description || undefined });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create link.' });
    }
  },

  respond: async ({ request, fetch }) => {
    const data = await request.formData();
    const id = String(data.get('id') ?? '').trim();
    const accept = data.get('accept') === 'true';
    const message = String(data.get('message') ?? '').trim();

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.respondToLink(id, { accept, message: message || undefined });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to respond to link.' });
    }
  },

  dissolve: async ({ request, fetch }) => {
    const data = await request.formData();
    const id = String(data.get('id') ?? '').trim();

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.dissolveLink(id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to dissolve link.' });
    }
  },
};
