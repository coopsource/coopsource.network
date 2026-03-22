import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  try {
    const [connectors, webhooks, catalog] = await Promise.all([
      api.getConnectorConfigs().catch(() => ({ configs: [] })),
      api.getWebhookEndpoints().catch(() => ({ endpoints: [] })),
      api.getEventCatalog().catch(() => ({ events: [] })),
    ]);

    return {
      connectors: connectors.configs,
      webhooks: webhooks.endpoints,
      eventCatalog: catalog.events,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load integrations.');
    }
    error(500, 'Failed to load integrations.');
  }
};

export const actions: Actions = {
  createConnector: async ({ request, fetch }) => {
    const formData = await request.formData();
    const connectorType = String(formData.get('connectorType') ?? '').trim();
    const displayName = String(formData.get('displayName') ?? '').trim();

    if (!connectorType) return fail(400, { error: 'Connector type is required.' });
    if (!displayName) return fail(400, { error: 'Display name is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createConnectorConfig({
        connectorType,
        displayName,
        enabled: true,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create connector.' });
    }
  },

  deleteConnector: async ({ request, fetch }) => {
    const formData = await request.formData();
    const id = String(formData.get('id') ?? '');

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.deleteConnectorConfig(id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to delete connector.' });
    }
  },

  createWebhook: async ({ request, fetch }) => {
    const formData = await request.formData();
    const url = String(formData.get('url') ?? '').trim();
    const secret = String(formData.get('secret') ?? '').trim();
    const eventTypesStr = String(formData.get('eventTypes') ?? '').trim();

    if (!url) return fail(400, { error: 'URL is required.' });
    if (!secret) return fail(400, { error: 'Secret is required.' });

    const eventTypes = eventTypesStr
      ? eventTypesStr.split(',').map((e) => e.trim()).filter(Boolean)
      : [];

    if (eventTypes.length === 0) return fail(400, { error: 'At least one event type is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createWebhookEndpoint({
        url,
        secret,
        eventTypes,
        enabled: true,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create webhook.' });
    }
  },

  deleteWebhook: async ({ request, fetch }) => {
    const formData = await request.formData();
    const id = String(formData.get('id') ?? '');

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.deleteWebhookEndpoint(id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to delete webhook.' });
    }
  },
};
