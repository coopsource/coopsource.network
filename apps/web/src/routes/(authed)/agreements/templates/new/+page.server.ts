import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async () => {
  return {};
};

export const actions: Actions = {
  default: async ({ request, fetch }) => {
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
    let template;
    try {
      template = await api.createAgreementTemplate({
        name,
        description: description || undefined,
        agreementType,
        templateData,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Failed to create template.' });
    }

    redirect(302, `/agreements/templates/${template.id}`);
  },
};
