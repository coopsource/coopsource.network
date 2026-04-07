import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const officersCursor = url.searchParams.get('officersCursor') ?? undefined;
  const complianceCursor = url.searchParams.get('complianceCursor') ?? undefined;
  const noticesCursor = url.searchParams.get('noticesCursor') ?? undefined;
  const fiscalCursor = url.searchParams.get('fiscalCursor') ?? undefined;

  const [officers, compliance, notices, fiscalPeriods, membersData, agentsResult] = await Promise.all([
    api.getOfficers({ limit: 20, cursor: officersCursor }),
    api.getComplianceItems({ limit: 20, cursor: complianceCursor }),
    api.getNotices({ limit: 20, cursor: noticesCursor }),
    api.getFiscalPeriods({ limit: 20, cursor: fiscalCursor }),
    api.getMembers({ limit: 50 }),
    api.getAgents().catch(() => ({ agents: [] })),
  ]);

  return {
    officers: officers.officers,
    officersCursor: officers.cursor,
    complianceItems: compliance.items,
    complianceCursor: compliance.cursor,
    notices: notices.notices,
    noticesCursor: notices.cursor,
    fiscalPeriods: fiscalPeriods.fiscalPeriods,
    fiscalCursor: fiscalPeriods.cursor,
    members: membersData.members,
    agents: agentsResult.agents,
  };
};

export const actions: Actions = {
  appointOfficer: async ({ request, fetch }) => {
    const data = await request.formData();
    const officerDid = String(data.get('officerDid') ?? '').trim();
    const title = String(data.get('title') ?? '').trim();
    const appointedAt = String(data.get('appointedAt') ?? '').trim();
    const appointmentType = String(data.get('appointmentType') ?? '').trim();
    const termEndsAt = String(data.get('termEndsAt') ?? '').trim();
    const responsibilities = String(data.get('responsibilities') ?? '').trim();

    if (!officerDid) return fail(400, { error: 'Please select a member.' });
    if (!title) return fail(400, { error: 'Title is required.' });
    if (!appointedAt) return fail(400, { error: 'Appointment date is required.' });
    if (!appointmentType) return fail(400, { error: 'Appointment type is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.appointOfficer({
        officerDid,
        title,
        appointedAt,
        appointmentType,
        termEndsAt: termEndsAt || undefined,
        responsibilities: responsibilities || undefined,
      });
      return { success: true, tab: 'officers' };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to appoint officer.' });
    }
  },

  endTerm: async ({ request, fetch }) => {
    const data = await request.formData();
    const id = String(data.get('id') ?? '').trim();

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.endOfficerTerm(id);
      return { success: true, tab: 'officers' };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to end officer term.' });
    }
  },

  createCompliance: async ({ request, fetch }) => {
    const data = await request.formData();
    const title = String(data.get('title') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const dueDate = String(data.get('dueDate') ?? '').trim();
    const filingType = String(data.get('filingType') ?? '').trim();

    if (!title) return fail(400, { error: 'Title is required.' });
    if (!dueDate) return fail(400, { error: 'Due date is required.' });
    if (!filingType) return fail(400, { error: 'Filing type is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createComplianceItem({ title, description: description || undefined, dueDate, filingType });
      return { success: true, tab: 'compliance' };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create compliance item.' });
    }
  },

  completeCompliance: async ({ request, fetch }) => {
    const data = await request.formData();
    const id = String(data.get('id') ?? '').trim();

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.completeComplianceItem(id);
      return { success: true, tab: 'compliance' };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to mark compliance item complete.' });
    }
  },

  createNotice: async ({ request, fetch }) => {
    const data = await request.formData();
    const title = String(data.get('title') ?? '').trim();
    const body = String(data.get('body') ?? '').trim();
    const noticeType = String(data.get('noticeType') ?? '').trim();
    const targetAudience = String(data.get('targetAudience') ?? '').trim();

    if (!title) return fail(400, { error: 'Title is required.' });
    if (!body) return fail(400, { error: 'Body is required.' });
    if (!noticeType) return fail(400, { error: 'Notice type is required.' });
    if (!targetAudience) return fail(400, { error: 'Target audience is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createNotice({ title, body, noticeType, targetAudience });
      return { success: true, tab: 'notices' };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to send notice.' });
    }
  },

  createFiscalPeriod: async ({ request, fetch }) => {
    const data = await request.formData();
    const label = String(data.get('label') ?? '').trim();
    const startsAt = String(data.get('startsAt') ?? '').trim();
    const endsAt = String(data.get('endsAt') ?? '').trim();

    if (!label) return fail(400, { error: 'Label is required.' });
    if (!startsAt) return fail(400, { error: 'Start date is required.' });
    if (!endsAt) return fail(400, { error: 'End date is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createFiscalPeriod({ label, startsAt, endsAt });
      return { success: true, tab: 'fiscal' };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create fiscal period.' });
    }
  },

  closeFiscalPeriod: async ({ request, fetch }) => {
    const data = await request.formData();
    const id = String(data.get('id') ?? '').trim();

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.closeFiscalPeriod(id);
      return { success: true, tab: 'fiscal' };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to close fiscal period.' });
    }
  },
};
