import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const [agentsResult, modelsResult] = await Promise.all([
    api.getAgents(),
    api.getAvailableModels(),
  ]);
  return {
    agents: agentsResult.agents,
    availableModels: modelsResult.providers,
  };
};

export const actions: Actions = {
  create: async ({ request, fetch }) => {
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    const systemPrompt = String(data.get('systemPrompt') ?? '').trim();
    const chatModel = String(data.get('chatModel') ?? '').trim();
    const agentType = String(data.get('agentType') ?? 'custom').trim();

    if (!name || !systemPrompt || !chatModel) {
      return fail(400, { error: 'Name, system prompt, and chat model are required.' });
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createAgent({
        name,
        systemPrompt,
        agentType,
        modelConfig: { chat: chatModel },
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create agent.' });
    }
  },

  createFromTemplate: async ({ request, fetch }) => {
    const data = await request.formData();
    const agentType = String(data.get('agentType') ?? '').trim();

    if (!agentType) return fail(400, { error: 'Agent type is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createAgentFromTemplate({ agentType });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create agent from template.' });
    }
  },

  delete: async ({ request, fetch }) => {
    const data = await request.formData();
    const id = String(data.get('id') ?? '').trim();

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.deleteAgent(id);
      return { deleteSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to delete agent.' });
    }
  },
};
