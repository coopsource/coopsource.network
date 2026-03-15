import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const [accounts, summary, members] = await Promise.all([
    api.getCapitalAccounts({ limit: 100 }),
    api.getCapitalAccountSummary().catch(() => null),
    api.getMembers({ limit: 200 }),
  ]);

  return {
    accounts: accounts.accounts,
    summary,
    members: members.members,
  };
};

export const actions: Actions = {
  contribute: async ({ request, fetch }) => {
    const data = await request.formData();
    const memberDid = String(data.get('memberDid') ?? '').trim();
    const amount = Number(data.get('amount') ?? 0);

    if (!memberDid) return fail(400, { error: 'Please select a member.' });
    if (amount <= 0) return fail(400, { error: 'Amount must be positive.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.recordContribution({ memberDid, amount });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to record contribution.' });
    }
  },

  redeem: async ({ request, fetch }) => {
    const data = await request.formData();
    const memberDid = String(data.get('memberDid') ?? '').trim();
    const amount = Number(data.get('amount') ?? 0);

    if (!memberDid) return fail(400, { error: 'Please select a member.' });
    if (amount <= 0) return fail(400, { error: 'Amount must be positive.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.redeemAllocation({ memberDid, amount });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to redeem allocation.' });
    }
  },
};
