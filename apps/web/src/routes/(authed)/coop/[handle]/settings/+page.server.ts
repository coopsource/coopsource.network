import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const [cooperative, notificationsResult, connectionsResult, servicesResult, paymentConfigs, supportedProviders] = await Promise.all([
    api.getCooperative(),
    api.getNotifications({ limit: 25 }).catch(() => ({ notifications: [], cursor: undefined })),
    api.getConnections().catch(() => ({ connections: [] })),
    api.getAvailableServices().catch(() => ({ services: [] })),
    api.getPaymentConfigs().catch(() => ({ providers: [] })),
    api.getSupportedProviders().catch(() => ({ providers: [] })),
  ]);

  return {
    cooperative,
    notifications: notificationsResult.notifications,
    notificationsCursor: notificationsResult.cursor,
    connections: connectionsResult.connections,
    availableServices: servicesResult.services,
    paymentConfigs: paymentConfigs.providers,
    supportedProviders: supportedProviders.providers,
  };
};

export const actions: Actions = {
  update: async ({ request, fetch }) => {
    const data = await request.formData();
    const displayName = String(data.get('displayName') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const website = String(data.get('website') ?? '').trim();

    if (!displayName) {
      return fail(400, { error: 'Display name is required.' });
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      const cooperative = await api.updateCooperative({
        displayName,
        description: description || undefined,
        website: website || undefined,
      });
      return { success: true, cooperative };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Update failed. Please try again.' });
    }
  },

  updateVisibility: async ({ request, fetch }) => {
    const data = await request.formData();
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      const cooperative = await api.updateCooperative({
        anonDiscoverable: data.get('anonDiscoverable') === 'on',
        publicDescription: data.get('publicDescription') === 'on',
        publicMembers: data.get('publicMembers') === 'on',
        publicActivity: data.get('publicActivity') === 'on',
        publicAgreements: data.get('publicAgreements') === 'on',
        publicCampaigns: data.get('publicCampaigns') === 'on',
      });
      return { visibilitySuccess: true, cooperative };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Update failed. Please try again.' });
    }
  },

  connect: async ({ request, fetch }) => {
    const formData = await request.formData();
    const service = String(formData.get('service') ?? '');

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);

    try {
      const result = await api.initiateConnection(service);
      return { redirect: result.authUrl };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { actionError: err.message });
      }
      return fail(500, { actionError: 'Failed to initiate connection.' });
    }
  },

  disconnect: async ({ request, fetch }) => {
    const formData = await request.formData();
    const uri = String(formData.get('uri') ?? '');

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);

    try {
      await api.revokeConnection(uri);
      return { actionSuccess: 'Connection revoked.' };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { actionError: err.message });
      }
      return fail(500, { actionError: 'Failed to revoke connection.' });
    }
  },

  addPaymentProvider: async ({ request, fetch }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const data = await request.formData();

    const providerId = String(data.get('providerId') ?? '');
    const displayName = String(data.get('displayName') ?? '');
    const secretKey = String(data.get('secretKey') ?? '');
    const webhookSecret = String(data.get('webhookSecret') ?? '');

    if (!providerId || !displayName || !secretKey) {
      return fail(400, { paymentError: 'All fields are required' });
    }

    try {
      await api.addPaymentConfig({
        providerId,
        displayName,
        credentials: { secretKey },
        webhookSecret: webhookSecret || undefined,
      });
      return { paymentSuccess: true };
    } catch (err) {
      return fail(400, { paymentError: err instanceof Error ? err.message : 'Failed to add provider' });
    }
  },

  togglePaymentProvider: async ({ request, fetch }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const data = await request.formData();

    const providerId = String(data.get('providerId') ?? '');
    const enabled = data.get('enabled') === 'true';

    try {
      await api.updatePaymentConfig(providerId, { enabled });
      return { paymentSuccess: true };
    } catch (err) {
      return fail(400, { paymentError: err instanceof Error ? err.message : 'Failed' });
    }
  },

  removePaymentProvider: async ({ request, fetch }) => {
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    const data = await request.formData();
    const providerId = String(data.get('providerId') ?? '');

    try {
      await api.deletePaymentConfig(providerId);
      return { paymentSuccess: true };
    } catch (err) {
      return fail(400, { paymentError: err instanceof Error ? err.message : 'Failed' });
    }
  },
};
