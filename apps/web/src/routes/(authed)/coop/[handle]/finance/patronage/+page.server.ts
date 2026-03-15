import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const fiscalPeriodId = url.searchParams.get('fiscalPeriodId') ?? undefined;

  const [configs, fiscalPeriods, members] = await Promise.all([
    api.getPatronageConfigs(),
    api.getFiscalPeriods({ limit: 50 }),
    api.getMembers({ limit: 200 }),
  ]);

  let records = null;
  if (fiscalPeriodId) {
    try {
      records = await api.getPatronageRecords({ fiscalPeriodId, limit: 100 });
    } catch {
      // ignore — no records for this period yet
    }
  }

  return {
    configs: configs.configs,
    fiscalPeriods: fiscalPeriods.fiscalPeriods,
    members: members.members,
    records: records?.records ?? [],
    selectedFiscalPeriodId: fiscalPeriodId ?? '',
  };
};

export const actions: Actions = {
  createConfig: async ({ request, fetch }) => {
    const data = await request.formData();
    const metricType = String(data.get('metricType') ?? '').trim();
    const stakeholderClass = String(data.get('stakeholderClass') ?? 'worker').trim();
    const cashPayoutPct = Number(data.get('cashPayoutPct') ?? 20);

    if (!metricType) return fail(400, { error: 'Metric type is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createPatronageConfig({ stakeholderClass, metricType, cashPayoutPct });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create patronage config.' });
    }
  },

  deleteConfig: async ({ request, fetch }) => {
    const data = await request.formData();
    const id = String(data.get('id') ?? '').trim();
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.deletePatronageConfig(id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to delete config.' });
    }
  },

  calculate: async ({ request, fetch }) => {
    const data = await request.formData();
    const fiscalPeriodId = String(data.get('fiscalPeriodId') ?? '').trim();
    const totalSurplus = Number(data.get('totalSurplus') ?? 0);
    const metricsJson = String(data.get('metrics') ?? '[]');

    if (!fiscalPeriodId) return fail(400, { error: 'Fiscal period is required.' });
    if (totalSurplus <= 0) return fail(400, { error: 'Total surplus must be positive.' });

    let metrics: Array<{ memberDid: string; metricValue: number; stakeholderClass?: string }> = [];
    try {
      metrics = JSON.parse(metricsJson);
    } catch {
      return fail(400, { error: 'Invalid metrics data.' });
    }

    if (metrics.length === 0) return fail(400, { error: 'At least one member metric is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.runPatronageCalculation({ fiscalPeriodId, totalSurplus, metrics });
      return { calcSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to run patronage calculation.' });
    }
  },

  approve: async ({ request, fetch }) => {
    const data = await request.formData();
    const fiscalPeriodId = String(data.get('fiscalPeriodId') ?? '').trim();
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      const result = await api.approvePatronageRecords({ fiscalPeriodId });
      return { approveSuccess: true, approved: result.approved };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to approve records.' });
    }
  },
};
