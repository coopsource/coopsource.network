import type { PageServerLoad } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const result = await api.getAgreementTemplates({ limit: 20, cursor });
  return { templates: result.templates, cursor: result.cursor };
};
