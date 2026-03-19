import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const source = url.searchParams.get('source') ?? undefined;
  const projectId = url.searchParams.get('projectId') ?? undefined;

  // Use current year range for summary
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearStartStr = yearStart.toISOString().split('T')[0]!;
  const todayStr = now.toISOString().split('T')[0]!;

  try {
    const [entriesResult, summaryResult] = await Promise.all([
      api.getRevenueEntries({ source, projectId, limit: 50 }),
      api.getOverallRevenueSummary(yearStartStr, todayStr).catch(() => ({ items: [] })),
    ]);
    return {
      entries: entriesResult.items,
      cursor: entriesResult.cursor,
      summary: summaryResult.items,
      filterSource: source ?? '',
      filterProjectId: projectId ?? '',
    };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load revenue.');
    }
    error(500, 'Failed to load revenue.');
  }
};

export const actions: Actions = {
  recordRevenue: async ({ request, fetch }) => {
    const formData = await request.formData();
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const amountStr = String(formData.get('amount') ?? '').trim();
    const source = String(formData.get('source') ?? '').trim();
    const periodStart = String(formData.get('periodStart') ?? '').trim();
    const periodEnd = String(formData.get('periodEnd') ?? '').trim();

    if (!title) return fail(400, { error: 'Title is required.' });
    if (!amountStr || isNaN(Number(amountStr))) return fail(400, { error: 'Valid amount is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createRevenueEntry({
        title,
        description: description || undefined,
        amount: Number(amountStr),
        source: source || undefined,
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to record revenue.' });
    }
  },

  deleteEntry: async ({ request, fetch }) => {
    const formData = await request.formData();
    const id = String(formData.get('id') ?? '');

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.deleteRevenueEntry(id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to delete revenue entry.' });
    }
  },
};
