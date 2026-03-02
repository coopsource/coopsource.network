import type { PageServerLoad } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, params }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const [agent, sessionsResult, modelsResult, triggersResult] = await Promise.all([
    api.getAgent(params.agentId),
    api.getAgentSessions(params.agentId).catch(() => ({ sessions: [] as never[] })),
    api.getAvailableModels().catch(() => ({ providers: [] as never[] })),
    api.getAgentTriggers(params.agentId).catch(() => ({ triggers: [] as never[] })),
  ]);

  return {
    agent,
    sessions: sessionsResult.sessions,
    availableModels: modelsResult.providers,
    triggers: triggersResult.triggers,
  };
};
