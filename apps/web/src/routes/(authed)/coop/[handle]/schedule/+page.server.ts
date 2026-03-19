import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  // Default to current week view
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const startAfter = url.searchParams.get('startAfter') ?? weekStart.toISOString();
  const endBefore = url.searchParams.get('endBefore') ?? weekEnd.toISOString();

  try {
    const [shiftsResult, fairnessResult] = await Promise.all([
      api.getShifts({ startAfter, endBefore, limit: 100 }),
      api.getShiftFairness(
        weekStart.toISOString().split('T')[0]!,
        weekEnd.toISOString().split('T')[0]!,
      ).catch(() => ({ items: [] })),
    ]);
    return {
      shifts: shiftsResult.items,
      cursor: shiftsResult.cursor,
      fairness: fairnessResult.items,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
    };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load schedule.');
    }
    error(500, 'Failed to load schedule.');
  }
};

export const actions: Actions = {
  createShift: async ({ request, fetch }) => {
    const formData = await request.formData();
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const startsAt = String(formData.get('startsAt') ?? '').trim();
    const endsAt = String(formData.get('endsAt') ?? '').trim();
    const location = String(formData.get('location') ?? '').trim();

    if (!title) return fail(400, { error: 'Title is required.' });
    if (!startsAt || !endsAt) return fail(400, { error: 'Start and end times are required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createShift({
        title,
        description: description || undefined,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        location: location || undefined,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create shift.' });
    }
  },

  claimShift: async ({ request, fetch }) => {
    const formData = await request.formData();
    const id = String(formData.get('id') ?? '');

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.claimShift(id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to claim shift.' });
    }
  },
};
