import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const [classes, members] = await Promise.all([
    api.getMemberClasses(),
    api.getMembers({ limit: 50 }),
  ]);

  return {
    classes: classes.classes,
    members: members.members,
  };
};

export const actions: Actions = {
  create: async ({ request, fetch }) => {
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const voteWeight = Number(data.get('voteWeight') ?? 1);
    const quorumWeight = Number(data.get('quorumWeight') ?? 1);
    const boardSeats = Number(data.get('boardSeats') ?? 0);

    if (!name) return fail(400, { error: 'Name is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createMemberClass({ name, description: description || undefined, voteWeight, quorumWeight, boardSeats });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create member class.' });
    }
  },

  delete: async ({ request, fetch }) => {
    const data = await request.formData();
    const id = String(data.get('id') ?? '').trim();
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.deleteMemberClass(id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to delete member class.' });
    }
  },

  assign: async ({ request, fetch }) => {
    const data = await request.formData();
    const memberDid = String(data.get('memberDid') ?? '').trim();
    const className = String(data.get('className') ?? '').trim();

    if (!memberDid) return fail(400, { error: 'Please select a member.' });
    if (!className) return fail(400, { error: 'Please select a class.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.assignMemberClass({ memberDid, className });
      return { assignSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to assign member class.' });
    }
  },

  removeAssignment: async ({ request, fetch }) => {
    const data = await request.formData();
    const memberDid = String(data.get('memberDid') ?? '').trim();
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.removeMemberClass(memberDid);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to remove member class.' });
    }
  },
};
