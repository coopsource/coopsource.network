import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const status = url.searchParams.get('status') ?? undefined;
  const cursor = url.searchParams.get('cursor') ?? undefined;

  const [config, progress, membersData] = await Promise.all([
    api.getOnboardingConfig().catch(() => null),
    api.getOnboardingProgress({ status, limit: 20, cursor }),
    api.getMembers({ limit: 50 }),
  ]);

  return {
    config,
    progress: progress.items,
    progressCursor: progress.cursor,
    members: membersData.members,
    filterStatus: status ?? '',
  };
};

export const actions: Actions = {
  createConfig: async ({ request, fetch }) => {
    const data = await request.formData();
    const probationDurationDays = Number(data.get('probationDurationDays') || 90);
    const requireTraining = data.get('requireTraining') === 'on';
    const requireBuyIn = data.get('requireBuyIn') === 'on';
    const buyInAmountStr = String(data.get('buyInAmount') ?? '').trim();
    const buddySystemEnabled = data.get('buddySystemEnabled') === 'on';
    const milestonesJson = String(data.get('milestones') ?? '[]');

    let milestones: Array<{ name: string; description?: string; order: number }> = [];
    try {
      milestones = JSON.parse(milestonesJson);
    } catch {
      // ignore parse errors
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createOnboardingConfig({
        probationDurationDays,
        requireTraining,
        requireBuyIn,
        buyInAmount: buyInAmountStr ? Number(buyInAmountStr) : undefined,
        buddySystemEnabled,
        milestones: milestones.length > 0 ? milestones : undefined,
      });
      return { success: true, tab: 'config' };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create onboarding config.' });
    }
  },

  updateConfig: async ({ request, fetch }) => {
    const data = await request.formData();
    const probationDurationDays = Number(data.get('probationDurationDays') || 90);
    const requireTraining = data.get('requireTraining') === 'on';
    const requireBuyIn = data.get('requireBuyIn') === 'on';
    const buyInAmountStr = String(data.get('buyInAmount') ?? '').trim();
    const buddySystemEnabled = data.get('buddySystemEnabled') === 'on';
    const milestonesJson = String(data.get('milestones') ?? '[]');

    let milestones: Array<{ name: string; description?: string; order: number }> = [];
    try {
      milestones = JSON.parse(milestonesJson);
    } catch {
      // ignore parse errors
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.updateOnboardingConfig({
        probationDurationDays,
        requireTraining,
        requireBuyIn,
        buyInAmount: buyInAmountStr ? Number(buyInAmountStr) : undefined,
        buddySystemEnabled,
        milestones: milestones.length > 0 ? milestones : undefined,
      });
      return { success: true, tab: 'config' };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to update onboarding config.' });
    }
  },

  startOnboarding: async ({ request, fetch }) => {
    const data = await request.formData();
    const memberDid = String(data.get('memberDid') ?? '').trim();

    if (!memberDid) return fail(400, { error: 'Please select a member.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.startOnboarding({ memberDid });
      return { success: true, tab: 'progress' };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to start onboarding.' });
    }
  },
};
