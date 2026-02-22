import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ params, fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const uri = decodeURIComponent(params.uri);

  try {
    const [agreement, termsResult] = await Promise.all([
      api.getMasterAgreement(uri),
      api.listStakeholderTerms(uri),
    ]);
    return { agreement, terms: termsResult.terms };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      error(404, 'Master agreement not found.');
    }
    error(500, 'Failed to load master agreement.');
  }
};

export const actions: Actions = {
  activate: async ({ params, fetch, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const uri = decodeURIComponent(params.uri);
    try {
      await api.activateMasterAgreement(uri);
      return { actionSuccess: 'Agreement activated.' };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { actionError: err.message });
      }
      return fail(500, { actionError: 'Failed to activate agreement.' });
    }
  },

  terminate: async ({ params, fetch, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const uri = decodeURIComponent(params.uri);
    try {
      await api.terminateMasterAgreement(uri);
      return { actionSuccess: 'Agreement terminated.' };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { actionError: err.message });
      }
      return fail(500, { actionError: 'Failed to terminate agreement.' });
    }
  },

  addTerms: async ({ params, fetch, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const uri = decodeURIComponent(params.uri);

    const formData = await request.formData();
    const stakeholderDid = String(formData.get('stakeholderDid') ?? '').trim();
    const stakeholderType = String(formData.get('stakeholderType') ?? 'worker').trim();
    const stakeholderClass = String(formData.get('stakeholderClass') ?? '').trim() || undefined;

    if (!stakeholderDid) {
      return fail(400, { actionError: 'Stakeholder DID is required.' });
    }

    try {
      await api.addStakeholderTerms(uri, {
        stakeholderDid,
        stakeholderType,
        stakeholderClass,
      });
      return { actionSuccess: 'Stakeholder terms added.' };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { actionError: err.message });
      }
      return fail(500, { actionError: 'Failed to add stakeholder terms.' });
    }
  },

  removeTerms: async ({ params, fetch, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const uri = decodeURIComponent(params.uri);

    const formData = await request.formData();
    const termsUri = String(formData.get('termsUri') ?? '');

    try {
      await api.removeStakeholderTerms(uri, termsUri);
      return { actionSuccess: 'Stakeholder terms removed.' };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { actionError: err.message });
      }
      return fail(500, { actionError: 'Failed to remove stakeholder terms.' });
    }
  },
};
