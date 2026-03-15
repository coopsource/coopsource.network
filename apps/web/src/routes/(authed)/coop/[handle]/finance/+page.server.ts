import type { PageServerLoad } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const [configs, summary, fiscalPeriods] = await Promise.all([
    api.getPatronageConfigs(),
    api.getCapitalAccountSummary().catch(() => null),
    api.getFiscalPeriods({ limit: 50 }),
  ]);

  return {
    patronageConfigs: configs.configs,
    capitalSummary: summary,
    fiscalPeriods: fiscalPeriods.fiscalPeriods,
  };
};
