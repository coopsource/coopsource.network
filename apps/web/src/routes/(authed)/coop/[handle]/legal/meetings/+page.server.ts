import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const meetingType = url.searchParams.get('meetingType') ?? undefined;
  const cursor = url.searchParams.get('cursor') ?? undefined;

  const result = await api.getMeetings({ meetingType, limit: 20, cursor });
  return {
    meetings: result.meetings,
    cursor: result.cursor,
    filterType: meetingType ?? '',
  };
};

export const actions: Actions = {
  create: async ({ request, fetch }) => {
    const data = await request.formData();
    const title = String(data.get('title') ?? '').trim();
    const meetingDate = String(data.get('meetingDate') ?? '').trim();
    const meetingType = String(data.get('meetingType') ?? '').trim();
    const attendeesStr = String(data.get('attendees') ?? '').trim();
    const quorumMet = data.get('quorumMet') === 'on';
    const resolutions = String(data.get('resolutions') ?? '').trim();
    const minutes = String(data.get('minutes') ?? '').trim();

    if (!title) return fail(400, { error: 'Title is required.' });
    if (!meetingDate) return fail(400, { error: 'Meeting date is required.' });
    if (!meetingType) return fail(400, { error: 'Meeting type is required.' });

    const attendees = attendeesStr ? attendeesStr.split(',').map((a) => a.trim()).filter(Boolean) : [];

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createMeeting({
        title,
        meetingDate,
        meetingType,
        attendees,
        quorumMet,
        resolutions: resolutions || undefined,
        minutes: minutes || undefined,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create meeting record.' });
    }
  },

  certify: async ({ request, fetch }) => {
    const data = await request.formData();
    const id = String(data.get('id') ?? '').trim();

    if (!id) return fail(400, { error: 'Missing meeting ID.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.certifyMeeting(id);
      return { certifySuccess: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to certify meeting.' });
    }
  },
};
