import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const status = url.searchParams.get('status') ?? undefined;

  // Compute week and month date ranges for summaries
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const weekStartStr = weekStart.toISOString().split('T')[0]!;
  const monthStartStr = monthStart.toISOString().split('T')[0]!;
  const todayStr = now.toISOString().split('T')[0]!;

  try {
    const [entriesResult, weekSummary, monthSummary] = await Promise.all([
      api.getTimeEntries({ status, limit: 50 }),
      api.getMemberTimeSummary('me', weekStartStr, todayStr).catch(() => ({ totalMinutes: 0, entryCount: 0 })),
      api.getMemberTimeSummary('me', monthStartStr, todayStr).catch(() => ({ totalMinutes: 0, entryCount: 0 })),
    ]);
    return {
      entries: entriesResult.entries,
      cursor: entriesResult.cursor,
      weekSummary,
      monthSummary,
      filterStatus: status ?? '',
    };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load time entries.');
    }
    error(500, 'Failed to load time entries.');
  }
};

export const actions: Actions = {
  createEntry: async ({ request, fetch }) => {
    const formData = await request.formData();
    const description = String(formData.get('description') ?? '').trim();
    const startedAt = String(formData.get('startedAt') ?? '').trim();
    const endedAt = String(formData.get('endedAt') ?? '').trim();
    const durationMinutes = String(formData.get('durationMinutes') ?? '').trim();

    if (!startedAt) return fail(400, { error: 'Start time is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createTimeEntry({
        description: description || undefined,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: endedAt ? new Date(endedAt).toISOString() : undefined,
        durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create time entry.' });
    }
  },

  submitEntries: async ({ request, fetch }) => {
    const formData = await request.formData();
    const entryIds = String(formData.get('entryIds') ?? '').split(',').filter(Boolean);

    if (entryIds.length === 0) return fail(400, { error: 'No entries selected.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.submitTimeEntries({ entryIds });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to submit time entries.' });
    }
  },

  deleteEntry: async ({ request, fetch }) => {
    const formData = await request.formData();
    const id = String(formData.get('id') ?? '');

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.deleteTimeEntry(id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to delete time entry.' });
    }
  },
};
