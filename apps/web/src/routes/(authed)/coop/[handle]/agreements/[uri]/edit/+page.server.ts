import { redirect, fail, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ params, fetch, request, locals }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const uri = decodeURIComponent(params.uri);

  let agreement;
  try {
    agreement = await api.getAgreement(uri);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      error(404, 'Agreement not found.');
    }
    error(500, 'Failed to load agreement.');
  }

  if (agreement.status !== 'draft' || agreement.authorDid !== locals.user?.did) {
    redirect(302, `/coop/${params.handle}/agreements/${params.uri}`);
  }

  return { agreement, user: locals.user };
};

export const actions: Actions = {
  default: async ({ request, fetch, params }) => {
    const data = await request.formData();
    const title = String(data.get('title') ?? '').trim();
    const agreementType = String(data.get('agreementType') ?? 'custom').trim();
    const purpose = String(data.get('purpose') ?? '').trim();
    const scope = String(data.get('scope') ?? '').trim();
    const body = String(data.get('body') ?? '').trim();

    if (!title) {
      return fail(400, { error: 'Title is required.' });
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);

    try {
      await api.updateAgreement(decodeURIComponent(params.uri), {
        title,
        agreementType,
        purpose: purpose || undefined,
        scope: scope || undefined,
        body: body || undefined,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Failed to update agreement.' });
    }

    redirect(302, `/coop/${params.handle}/agreements/${params.uri}`);
  },
};
