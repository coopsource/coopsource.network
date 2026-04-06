import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const tab = url.searchParams.get('tab') ?? undefined;
  const obStatus = url.searchParams.get('status') ?? undefined;

  const [membersResult, invResult, obConfig, obProgress, allMembers] = await Promise.all([
    api.getMembers({ limit: 20, cursor }),
    api.getInvitations({ limit: 20 }).catch(() => ({ invitations: [], cursor: undefined })),
    api.getOnboardingConfig().catch(() => null),
    api.getOnboardingProgress({ status: obStatus, limit: 20 }).catch(() => ({ items: [], cursor: null })),
    api.getMembers({ limit: 50 }).catch(() => ({ members: [], cursor: null })),
  ]);

  return {
    members: membersResult.members,
    cursor: membersResult.cursor,
    invitations: invResult.invitations,
    invitationsCursor: invResult.cursor,
    onboardingConfig: obConfig,
    onboardingProgress: obProgress.items,
    onboardingProgressCursor: obProgress.cursor,
    allMembers: allMembers.members,
    onboardingFilterStatus: obStatus ?? '',
    activeTab: tab,
  };
};

export const actions: Actions = {
  invite: async ({ request, fetch }) => {
    const data = await request.formData();
    const email = String(data.get('email') ?? '').trim();
    const rolesStr = String(data.get('roles') ?? '').trim();
    const message = String(data.get('message') ?? '').trim();

    if (!email) {
      return fail(400, { inviteError: 'Email is required.' });
    }

    const roles = rolesStr ? rolesStr.split(',').map((r) => r.trim()).filter(Boolean) : [];

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createInvitation({ email, roles, message: message || undefined });
      return { inviteSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { inviteError: err.message });
      }
      return fail(500, { inviteError: 'Failed to send invitation.' });
    }
  },

  remove: async ({ request, fetch }) => {
    const data = await request.formData();
    const did = String(data.get('did') ?? '').trim();

    if (!did) {
      return fail(400, { removeError: 'Missing member DID.' });
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.removeMember(did);
      return { removeSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { removeError: err.message });
      }
      return fail(500, { removeError: 'Failed to remove member.' });
    }
  },

  revoke: async ({ request, fetch }) => {
    const data = await request.formData();
    const id = String(data.get('id') ?? '').trim();

    if (!id) {
      return fail(400, { revokeError: 'Missing invitation ID.' });
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.revokeInvitation(id);
      return { revokeSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { revokeError: err.message });
      }
      return fail(500, { revokeError: 'Failed to revoke invitation.' });
    }
  },

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
      return { configSuccess: true, activeTab: 'onboarding' };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { configError: err.message });
      return fail(500, { configError: 'Failed to create onboarding config.' });
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
      return { configSuccess: true, activeTab: 'onboarding' };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { configError: err.message });
      return fail(500, { configError: 'Failed to update onboarding config.' });
    }
  },

  startOnboarding: async ({ request, fetch }) => {
    const data = await request.formData();
    const memberDid = String(data.get('memberDid') ?? '').trim();

    if (!memberDid) return fail(400, { onboardingError: 'Please select a member.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.startOnboarding({ memberDid });
      return { onboardingSuccess: true, activeTab: 'onboarding' };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { onboardingError: err.message });
      return fail(500, { onboardingError: 'Failed to start onboarding.' });
    }
  },
};
