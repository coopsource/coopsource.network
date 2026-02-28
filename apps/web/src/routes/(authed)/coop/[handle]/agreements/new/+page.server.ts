import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async () => {
  return {};
};

export const actions: Actions = {
  default: async ({ request, fetch, params }) => {
    const data = await request.formData();
    const title = String(data.get('title') ?? '').trim();
    const purpose = String(data.get('purpose') ?? '').trim();
    const scope = String(data.get('scope') ?? '').trim();
    const body = String(data.get('body') ?? '').trim();
    const agreementType = String(data.get('agreementType') ?? 'custom').trim();

    if (!title) {
      return fail(400, { error: 'Title is required.' });
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    let agreement;
    try {
      agreement = await api.createAgreement({
        title,
        purpose: purpose || undefined,
        scope: scope || undefined,
        body: body || undefined,
        agreementType,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Failed to create agreement.' });
    }

    redirect(302, `/coop/${params.handle}/agreements/${encodeURIComponent(agreement.uri)}`);
  },
};
