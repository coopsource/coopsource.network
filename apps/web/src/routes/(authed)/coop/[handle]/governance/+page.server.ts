import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const status = url.searchParams.get('status') ?? undefined;
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const tab = url.searchParams.get('tab') ?? 'proposals';

  try {
    const [result, delegations, actionItems, outcomes, members] = await Promise.all([
      api.getProposals({ status, limit: 20, cursor }),
      api.getDelegations({ limit: 50 }).catch(() => ({ delegations: [], cursor: null })),
      api.getGovernanceActionItems({ limit: 20 }).catch(() => ({ items: [], cursor: undefined })),
      api.getGovernanceOutcomes({ limit: 20 }).catch(() => ({ items: [], cursor: undefined })),
      api.getMembers({ limit: 200 }),
    ]);
    return {
      proposals: result.proposals,
      cursor: result.cursor,
      filterStatus: status ?? '',
      delegations: delegations.delegations,
      actionItems: actionItems.items,
      outcomes: outcomes.items,
      members: members.members,
      activeTab: tab,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load governance.');
    }
    error(500, 'Failed to load governance.');
  }
};

export const actions: Actions = {
  createDelegation: async ({ request, fetch }) => {
    const data = await request.formData();
    const delegateeDid = String(data.get('delegateeDid') ?? '').trim();
    const scope = String(data.get('scope') ?? 'project').trim();

    if (!delegateeDid) return fail(400, { error: 'Please select a delegatee.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createDelegation({ delegateeDid, scope });
      return { delegationSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create delegation.' });
    }
  },

  revokeDelegation: async ({ request, fetch }) => {
    const data = await request.formData();
    const uri = String(data.get('uri') ?? '').trim();

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.revokeDelegation(uri);
      return { delegationSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to revoke delegation.' });
    }
  },
};
