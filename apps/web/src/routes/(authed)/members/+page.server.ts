import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const result = await api.getMembers({ limit: 20, cursor });
  return { members: result.members, cursor: result.cursor };
};

export const actions: Actions = {
  invite: async ({ request, fetch }) => {
    const data = await request.formData();
    const email = String(data.get('email') ?? '').trim();
    const rolesStr = String(data.get('roles') ?? '').trim();
    const message = String(data.get('message') ?? '').trim();

    if (!email) {
      return fail(400, { inviteError: 'Email is required.' });
    }

    const roles = rolesStr ? rolesStr.split(',').map((r) => r.trim()).filter(Boolean) : [];

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createInvitation({ email, roles, message: message || undefined });
      return { inviteSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { inviteError: err.message });
      }
      return fail(500, { inviteError: 'Failed to send invitation.' });
    }
  },

  remove: async ({ request, fetch }) => {
    const data = await request.formData();
    const did = String(data.get('did') ?? '').trim();

    if (!did) {
      return fail(400, { removeError: 'Missing member DID.' });
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.removeMember(did);
      return { removeSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { removeError: err.message });
      }
      return fail(500, { removeError: 'Failed to remove member.' });
    }
  },
};
