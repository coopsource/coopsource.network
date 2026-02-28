import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ params, fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  try {
    const [proposal, votesData] = await Promise.all([
      api.getProposal(params.id),
      api.getVotes(params.id),
    ]);
    return { proposal, votes: votesData.votes, tally: votesData.tally };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      error(404, 'Proposal not found.');
    }
    error(500, 'Failed to load proposal.');
  }
};

export const actions: Actions = {
  vote: async ({ request, params, fetch }) => {
    const data = await request.formData();
    const choice = String(data.get('choice') ?? '') as 'yes' | 'no' | 'abstain';
    const rationale = String(data.get('rationale') ?? '').trim();

    if (!['yes', 'no', 'abstain'].includes(choice)) {
      return fail(400, { voteError: 'Invalid vote choice.' });
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.castVote(params.id, { choice, rationale: rationale || undefined });
      return { voteSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { voteError: err.message });
      }
      return fail(500, { voteError: 'Failed to cast vote.' });
    }
  },

  retractVote: async ({ params, fetch, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.retractVote(params.id);
      return { retractSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { voteError: err.message });
      }
      return fail(500, { voteError: 'Failed to retract vote.' });
    }
  },

  open: async ({ params, fetch, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.openProposal(params.id);
      return { actionSuccess: 'Proposal opened for voting.' };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { actionError: err.message });
      }
      return fail(500, { actionError: 'Failed to open proposal.' });
    }
  },

  close: async ({ params, fetch, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.closeProposal(params.id);
      return { actionSuccess: 'Proposal closed.' };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { actionError: err.message });
      }
      return fail(500, { actionError: 'Failed to close proposal.' });
    }
  },

  resolve: async ({ params, fetch, request }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.resolveProposal(params.id);
      return { actionSuccess: 'Proposal resolved.' };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { actionError: err.message });
      }
      return fail(500, { actionError: 'Failed to resolve proposal.' });
    }
  },
};
