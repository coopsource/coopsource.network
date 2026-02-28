import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, params }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const template = await api.getAgreementTemplate(params.id);
  return { template };
};

export const actions: Actions = {
  update: async ({ request, fetch, params }) => {
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const agreementType = String(data.get('agreementType') ?? 'custom').trim();
    const title = String(data.get('title') ?? '').trim();
    const purpose = String(data.get('purpose') ?? '').trim();
    const scope = String(data.get('scope') ?? '').trim();
    const body = String(data.get('body') ?? '').trim();

    if (!name) {
      return fail(400, { error: 'Template name is required.' });
    }

    const templateData: Record<string, unknown> = {};
    if (title) templateData.title = title;
    if (purpose) templateData.purpose = purpose;
    if (scope) templateData.scope = scope;
    if (body) templateData.body = body;

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.updateAgreementTemplate(params.id, {
        name,
        description: description || undefined,
        agreementType,
        templateData,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Failed to update template.' });
    }

    return { success: true };
  },

  use: async ({ request, fetch, params }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    let agreement;
    try {
      agreement = await api.useAgreementTemplate(params.id);
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Failed to create agreement from template.' });
    }

    redirect(302, `/coop/${params.handle}/agreements/${encodeURIComponent(agreement.uri)}`);
  },

  delete: async ({ request, fetch, params }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.deleteAgreementTemplate(params.id);
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Failed to delete template.' });
    }

    redirect(302, `/coop/${params.handle}/agreements/templates`);
  },
};
