import type { PageServerLoad } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const [all, approved, rejected, active, archived, suspended, ratified] = await Promise.all([
    api.getGovernanceLabels({ limit: 100 }),
    api.getGovernanceLabels({ value: 'proposal-approved' }),
    api.getGovernanceLabels({ value: 'proposal-rejected' }),
    api.getGovernanceLabels({ value: 'proposal-active' }),
    api.getGovernanceLabels({ value: 'proposal-archived' }),
    api.getGovernanceLabels({ value: 'member-suspended' }),
    api.getGovernanceLabels({ value: 'agreement-ratified' }),
  ]);

  return {
    labels: all.labels,
    counts: {
      approved: approved.labels.length,
      rejected: rejected.labels.length,
      active: active.labels.length,
      archived: archived.labels.length,
      suspended: suspended.labels.length,
      ratified: ratified.labels.length,
    },
  };
};
