import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';
import { forwardSessionCookie } from '$lib/server/cookies.js';

export const load: PageServerLoad = async ({ fetch }) => {
  const api = createApiClient(fetch);
  try {
    const status = await api.getSetupStatus();
    if (status.setupComplete) {
      redirect(302, '/login');
    }
  } catch {
    // ignore — let the page render anyway
  }
  return {};
};

export const actions: Actions = {
  default: async ({ request, fetch, cookies }) => {
    const data = await request.formData();

    const cooperativeName = String(data.get('cooperativeName') ?? '').trim();
    const cooperativeHandle = String(data.get('cooperativeHandle') ?? '').trim();
    const adminDisplayName = String(data.get('adminDisplayName') ?? '').trim();
    const adminHandle = String(data.get('adminHandle') ?? '').trim();
    const adminEmail = String(data.get('adminEmail') ?? '').trim();
    const adminPassword = String(data.get('adminPassword') ?? '');

    if (!cooperativeName || !adminDisplayName || !adminEmail || !adminPassword) {
      return fail(400, { error: 'All fields are required.' });
    }

    const api = createApiClient(fetch);
    const res = await api.setupInitializeRaw({
      cooperativeName,
      cooperativeHandle,
      adminDisplayName,
      adminHandle,
      adminEmail,
      adminPassword,
    });

    if (!res.ok) {
      let msg = 'Setup failed. Please try again.';
      try {
        const body = (await res.json()) as { message?: string; error?: string };
        msg = body.message ?? body.error ?? msg;
      } catch { /* ignore */ }
      return fail(res.status, { error: msg });
    }

    // Forward session cookie so admin is logged in immediately after setup
    forwardSessionCookie(res, cookies);
    redirect(302, '/dashboard');
  },
};
