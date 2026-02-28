import { redirect } from '@sveltejs/kit';
import { createApiClient } from '$lib/api/client.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  try {
    const coop = await api.getCooperative();
    if (coop?.handle) redirect(301, `/coop/${coop.handle}/agreements/templates`);
  } catch { /* fallthrough */ }
  redirect(302, '/dashboard');
};
