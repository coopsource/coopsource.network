import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  // Current month range
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]!;
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]!;

  try {
    const [engagement, financial, operational] = await Promise.all([
      api.getMemberEngagement(startDate, endDate).catch(() => ({
        votingParticipation: 0,
        proposalCount: 0,
        agreementCount: 0,
        memberCount: 0,
        activeMemberCount: 0,
      })),
      api.getFinancialSummary(startDate, endDate).catch(() => ({
        totalRevenue: 0,
        totalExpenses: 0,
        netIncome: 0,
        pendingExpenses: 0,
        approvedExpenses: 0,
      })),
      api.getOperationalSummary(startDate, endDate).catch(() => ({
        tasksCompleted: 0,
        tasksInProgress: 0,
        timeLogged: 0,
        upcomingCompliance: 0,
        activeAgreements: 0,
      })),
    ]);

    return {
      engagement,
      financial,
      operational,
      periodLabel: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load dashboard.');
    }
    error(500, 'Failed to load dashboard.');
  }
};
