import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ params, fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const memberDid = decodeURIComponent(params.memberDid);

  try {
    const [account, transactions, member] = await Promise.all([
      api.getMemberCapitalAccount(memberDid),
      api.getMemberCapitalTransactions(memberDid, { limit: 100 }),
      api.getMember(memberDid).catch(() => null),
    ]);

    return {
      account,
      transactions: transactions.transactions,
      member,
      memberDid,
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      error(404, 'Capital account not found.');
    }
    error(500, 'Failed to load capital account.');
  }
};
