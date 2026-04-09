import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ params, fetch, request, locals }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const proposal = await api.getProposal(params.id);

  if (proposal.status !== 'draft' || proposal.authorDid !== locals.user?.did) {
    redirect(302, `/coop/${params.handle}/governance/${params.id}`);
  }

  return { proposal, user: locals.user };
};

export const actions: Actions = {
  default: async ({ request, fetch, params }) => {
    const data = await request.formData();
    const title = String(data.get('title') ?? '').trim();
    const body = String(data.get('body') ?? '').trim();
    const votingType = String(data.get('votingType') ?? 'binary').trim();
    const quorumType = String(data.get('quorumType') ?? 'simpleMajority').trim();
    const closesAt = String(data.get('closesAt') ?? '').trim();

    if (!title || !body) {
      return fail(400, { error: 'Title and body are required.' });
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.updateProposal(params.id, {
        title,
        body,
        votingMethod: votingType,
        quorumRequired: quorumType,
        votingEndsAt: closesAt || undefined,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Failed to update proposal.' });
    }

    redirect(302, `/coop/${params.handle}/governance/${params.id}`);
  },
};
