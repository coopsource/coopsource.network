import type { PageServerLoad } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, params }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const [agent, sessionsResult, modelsResult] = await Promise.all([
    api.getAgent(params.agentId),
    api.getAgentSessions(params.agentId),
    api.getAvailableModels(),
  ]);

  return {
    agent,
    sessions: sessionsResult.sessions,
    availableModels: modelsResult.providers,
  };
};
