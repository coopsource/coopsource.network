import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const taxYear = url.searchParams.get('taxYear') ? Number(url.searchParams.get('taxYear')) : undefined;
  const status = url.searchParams.get('status') ?? undefined;

  const [forms, deadlines, fiscalPeriods, members] = await Promise.all([
    api.getTaxForms({ taxYear, status, limit: 100 }),
    api.getTaxDeadlines().catch(() => ({ forms: [] })),
    api.getFiscalPeriods({ limit: 50 }),
    api.getMembers({ limit: 50 }),
  ]);

  return {
    forms: forms.forms,
    deadlines: deadlines.forms,
    fiscalPeriods: fiscalPeriods.fiscalPeriods,
    members: members.members,
    filterYear: taxYear ?? '',
    filterStatus: status ?? '',
  };
};

export const actions: Actions = {
  generate: async ({ request, fetch }) => {
    const data = await request.formData();
    const fiscalPeriodId = String(data.get('fiscalPeriodId') ?? '').trim();
    const taxYear = Number(data.get('taxYear') ?? 0);

    if (!fiscalPeriodId) return fail(400, { error: 'Fiscal period is required.' });
    if (!taxYear) return fail(400, { error: 'Tax year is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.generateTaxForms({ fiscalPeriodId, taxYear });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to generate tax forms.' });
    }
  },

  markGenerated: async ({ request, fetch }) => {
    const data = await request.formData();
    const id = String(data.get('id') ?? '').trim();
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.markTaxFormGenerated(id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to update tax form.' });
    }
  },

  markSent: async ({ request, fetch }) => {
    const data = await request.formData();
    const id = String(data.get('id') ?? '').trim();
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.markTaxFormSent(id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to update tax form.' });
    }
  },

  recordPayment: async ({ request, fetch }) => {
    const data = await request.formData();
    const id = String(data.get('id') ?? '').trim();
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.recordTaxFormPayment(id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to record payment.' });
    }
  },
};
