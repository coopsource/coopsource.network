import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const actions: Actions = {
  default: async ({ request, fetch, params }) => {
    const data = await request.formData();
    const title = String(data.get('title') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const category = String(data.get('category') ?? 'other');

    if (!title) {
      return fail(400, { error: 'Title is required.' });
    }

    const criteriaCount = parseInt(String(data.get('criteriaCount') ?? '0'), 10);
    const successCriteria: Array<{ metric: string; target: string; timeline?: string }> = [];

    for (let i = 0; i < criteriaCount; i++) {
      const metric = String(data.get(`criteria_metric_${i}`) ?? '').trim();
      const target = String(data.get(`criteria_target_${i}`) ?? '').trim();
      const timeline = String(data.get(`criteria_timeline_${i}`) ?? '').trim() || undefined;

      if (metric && target) {
        successCriteria.push({ metric, target, timeline });
      }
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);

    let outcome;
    try {
      outcome = await api.createOutcome({
        title,
        description: description || undefined,
        category,
        successCriteria: successCriteria.length > 0 ? successCriteria : undefined,
      });
    } catch (err) {
      if (err instanceof Error && 'status' in err) {
        return fail(400, { error: err.message });
      }
      throw err;
    }

    redirect(302, `/coop/${params.handle}/alignment/outcomes/${encodeURIComponent(outcome.uri)}`);
  },
};
