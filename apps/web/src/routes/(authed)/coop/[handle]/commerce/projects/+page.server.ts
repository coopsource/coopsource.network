import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const status = url.searchParams.get('status') ?? undefined;

  try {
    const [projectsResult, agreementsResult] = await Promise.all([
      api.getCollaborativeProjects({ status, limit: 50 }),
      api.getIntercoopAgreements({ status, limit: 50 }),
    ]);
    return {
      projects: projectsResult.items,
      projectsCursor: projectsResult.cursor,
      agreements: agreementsResult.items,
      agreementsCursor: agreementsResult.cursor,
      filterStatus: status ?? '',
    };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load projects.');
    }
    error(500, 'Failed to load projects.');
  }
};

export const actions: Actions = {
  createProject: async ({ request, fetch }) => {
    const formData = await request.formData();
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const participantDidsStr = String(formData.get('participantDids') ?? '').trim();

    if (!title) return fail(400, { error: 'Title is required.' });

    const participantDids = participantDidsStr
      ? participantDidsStr.split(',').map((d) => d.trim()).filter(Boolean)
      : [];

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createCollaborativeProject({
        title,
        description: description || undefined,
        participantDids,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create project.' });
    }
  },

  createAgreement: async ({ request, fetch }) => {
    const formData = await request.formData();
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const responderDid = String(formData.get('responderDid') ?? '').trim();
    const agreementType = String(formData.get('agreementType') ?? 'trade').trim();

    if (!title) return fail(400, { error: 'Title is required.' });
    if (!responderDid) return fail(400, { error: 'Responder DID is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createIntercoopAgreement({
        title,
        description: description || undefined,
        responderDid,
        agreementType,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create agreement.' });
    }
  },

  respondToAgreement: async ({ request, fetch }) => {
    const formData = await request.formData();
    const id = String(formData.get('id') ?? '').trim();
    const accept = formData.get('accept') === 'true';

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.respondToIntercoopAgreement(id, { accept });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to respond to agreement.' });
    }
  },
};
