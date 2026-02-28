import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const myInterests = await api.getMyInterests();

  return { myInterests };
};

export const actions: Actions = {
  default: async ({ request, fetch, params }) => {
    const formData = await request.formData();
    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);

    // Parse interests from form
    const interestCount = parseInt(String(formData.get('interestCount') ?? '1'), 10);
    const interests: Array<{ category: string; description: string; priority: number; scope?: string }> = [];

    for (let i = 0; i < interestCount; i++) {
      const category = String(formData.get(`interest_category_${i}`) ?? '').trim();
      const description = String(formData.get(`interest_description_${i}`) ?? '').trim();
      const priority = parseInt(String(formData.get(`interest_priority_${i}`) ?? '3'), 10);
      const scope = String(formData.get(`interest_scope_${i}`) ?? '').trim() || undefined;

      if (category && description) {
        interests.push({ category, description, priority, scope });
      }
    }

    if (interests.length === 0) {
      return fail(400, { error: 'At least one interest is required.' });
    }

    // Parse contributions
    const contributionCount = parseInt(String(formData.get('contributionCount') ?? '0'), 10);
    const contributions: Array<{ type: string; description: string; capacity?: string }> = [];

    for (let i = 0; i < contributionCount; i++) {
      const type = String(formData.get(`contribution_type_${i}`) ?? '').trim();
      const description = String(formData.get(`contribution_description_${i}`) ?? '').trim();
      const capacity = String(formData.get(`contribution_capacity_${i}`) ?? '').trim() || undefined;

      if (type && description) {
        contributions.push({ type: type as 'skill' | 'resource' | 'capital' | 'network' | 'time', description, capacity });
      }
    }

    // Parse constraints
    const constraintCount = parseInt(String(formData.get('constraintCount') ?? '0'), 10);
    const constraints: Array<{ description: string; hardConstraint?: boolean }> = [];

    for (let i = 0; i < constraintCount; i++) {
      const description = String(formData.get(`constraint_description_${i}`) ?? '').trim();
      const hardConstraint = formData.get(`constraint_hard_${i}`) === 'on';

      if (description) {
        constraints.push({ description, hardConstraint: hardConstraint || undefined });
      }
    }

    // Parse red lines
    const redLineCount = parseInt(String(formData.get('redLineCount') ?? '0'), 10);
    const redLines: Array<{ description: string; reason?: string }> = [];

    for (let i = 0; i < redLineCount; i++) {
      const description = String(formData.get(`redline_description_${i}`) ?? '').trim();
      const reason = String(formData.get(`redline_reason_${i}`) ?? '').trim() || undefined;

      if (description) {
        redLines.push({ description, reason });
      }
    }

    // Parse preferences
    const decisionMaking = String(formData.get('pref_decisionMaking') ?? '').trim() || undefined;
    const communication = String(formData.get('pref_communication') ?? '').trim() || undefined;
    const pace = String(formData.get('pref_pace') ?? '').trim() || undefined;

    const preferences = (decisionMaking || communication || pace)
      ? { decisionMaking, communication, pace }
      : undefined;

    const isUpdate = formData.get('_action') === 'update';
    const body = {
      interests,
      contributions: contributions.length > 0 ? contributions : undefined,
      constraints: constraints.length > 0 ? constraints : undefined,
      redLines: redLines.length > 0 ? redLines : undefined,
      preferences,
    };

    try {
      if (isUpdate) {
        await api.updateInterests(body);
      } else {
        await api.submitInterests(body);
      }
    } catch (err) {
      if (err instanceof Error && 'status' in err) {
        return fail(400, { error: err.message });
      }
      throw err;
    }

    redirect(302, `/coop/${params.handle}/alignment`);
  },
};
