import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ params, fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  try {
    const agreement = await api.getAgreement(params.id);
    return { agreement };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      error(404, 'Agreement not found.');
    }
    error(500, 'Failed to load agreement.');
  }
};

export const actions: Actions = {
  open: async ({ params, fetch, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.openAgreement(params.id);
      return { actionSuccess: 'Agreement opened for signing.' };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { actionError: err.message });
      }
      return fail(500, { actionError: 'Failed to open agreement.' });
    }
  },

  sign: async ({ params, fetch, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.signAgreement(params.id, { signatureType: 'electronic' });
      return { actionSuccess: 'Agreement signed.' };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { actionError: err.message });
      }
      return fail(500, { actionError: 'Failed to sign agreement.' });
    }
  },

  retractSignature: async ({ params, fetch, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.retractSignature(params.id);
      return { actionSuccess: 'Signature retracted.' };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { actionError: err.message });
      }
      return fail(500, { actionError: 'Failed to retract signature.' });
    }
  },

  void: async ({ params, fetch, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.voidAgreement(params.id);
      return { actionSuccess: 'Agreement voided.' };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { actionError: err.message });
      }
      return fail(500, { actionError: 'Failed to void agreement.' });
    }
  },
};
