import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const reportType = url.searchParams.get('reportType') ?? undefined;

  try {
    const [templatesResult, reportsResult] = await Promise.all([
      api.getReportTemplates(),
      api.getReports({ reportType, limit: 25 }),
    ]);
    return {
      templates: templatesResult.items,
      reports: reportsResult.items,
      cursor: reportsResult.cursor,
      filterType: reportType ?? '',
    };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load reports.');
    }
    error(500, 'Failed to load reports.');
  }
};

export const actions: Actions = {
  createTemplate: async ({ request, fetch }) => {
    const formData = await request.formData();
    const name = String(formData.get('name') ?? '').trim();
    const reportType = String(formData.get('reportType') ?? '').trim();

    if (!name) return fail(400, { error: 'Template name is required.' });
    if (!reportType) return fail(400, { error: 'Report type is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createReportTemplate({ name, reportType });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create template.' });
    }
  },

  generateReport: async ({ request, fetch }) => {
    const formData = await request.formData();
    const title = String(formData.get('title') ?? '').trim();
    const reportType = String(formData.get('reportType') ?? '').trim();
    const templateId = String(formData.get('templateId') ?? '').trim();
    const periodStart = String(formData.get('periodStart') ?? '').trim();
    const periodEnd = String(formData.get('periodEnd') ?? '').trim();

    if (!title) return fail(400, { error: 'Report title is required.' });
    if (!reportType) return fail(400, { error: 'Report type is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.generateReport({
        title,
        reportType,
        templateId: templateId || undefined,
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to generate report.' });
    }
  },

  deleteTemplate: async ({ request, fetch }) => {
    const formData = await request.formData();
    const id = String(formData.get('id') ?? '');

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.deleteReportTemplate(id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to delete template.' });
    }
  },
};
