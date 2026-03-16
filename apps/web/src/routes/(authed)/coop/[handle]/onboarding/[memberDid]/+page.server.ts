import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ params, fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const memberDid = decodeURIComponent(params.memberDid);

  let progress;
  try {
    progress = await api.getMemberOnboarding(memberDid);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      error(404, 'Onboarding not found.');
    }
    throw err;
  }

  if (!progress) {
    error(404, 'Onboarding not found for this member.');
  }

  const [reviews, config, membersData] = await Promise.all([
    api.getOnboardingReviews(memberDid),
    api.getOnboardingConfig().catch(() => null),
    api.getMembers({ limit: 50 }),
  ]);

  return {
    progress,
    reviews: reviews.reviews,
    config,
    members: membersData.members,
    memberDid,
  };
};

export const actions: Actions = {
  completeTraining: async ({ request, fetch }) => {
    const data = await request.formData();
    const memberDid = String(data.get('memberDid') ?? '').trim();
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.completeTraining({ memberDid });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to complete training.' });
    }
  },

  completeBuyIn: async ({ request, fetch }) => {
    const data = await request.formData();
    const memberDid = String(data.get('memberDid') ?? '').trim();
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.completeBuyIn({ memberDid });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to complete buy-in.' });
    }
  },

  completeMilestone: async ({ request, fetch }) => {
    const data = await request.formData();
    const memberDid = String(data.get('memberDid') ?? '').trim();
    const milestoneName = String(data.get('milestoneName') ?? '').trim();
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.completeMilestone({ memberDid, milestoneName });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to complete milestone.' });
    }
  },

  assignBuddy: async ({ request, fetch }) => {
    const data = await request.formData();
    const memberDid = String(data.get('memberDid') ?? '').trim();
    const buddyDid = String(data.get('buddyDid') ?? '').trim();
    if (!buddyDid) return fail(400, { error: 'Please select a buddy.' });
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.assignBuddy({ memberDid, buddyDid });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to assign buddy.' });
    }
  },

  createReview: async ({ request, fetch }) => {
    const data = await request.formData();
    const memberDid = String(data.get('memberDid') ?? '').trim();
    const reviewType = String(data.get('reviewType') ?? '').trim();
    const outcome = String(data.get('outcome') ?? '').trim();
    const comments = String(data.get('comments') ?? '').trim();
    const milestoneName = String(data.get('milestoneName') ?? '').trim();

    if (!reviewType) return fail(400, { error: 'Review type is required.' });
    if (!outcome) return fail(400, { error: 'Outcome is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createOnboardingReview({
        memberDid,
        reviewType,
        outcome,
        comments: comments || undefined,
        milestoneName: milestoneName || undefined,
      });
      return { reviewSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create review.' });
    }
  },

  completeOnboarding: async ({ request, fetch }) => {
    const data = await request.formData();
    const memberDid = String(data.get('memberDid') ?? '').trim();
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.completeOnboarding({ memberDid });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to complete onboarding.' });
    }
  },
};
