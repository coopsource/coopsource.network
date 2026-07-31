import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';
import { ProposalQuorumTypeSchema } from '@coopsource/common';

export const load: PageServerLoad = async () => {
  return {};
};

export const actions: Actions = {
  default: async ({ request, fetch, params }) => {
    const data = await request.formData();
    const title = String(data.get('title') ?? '').trim();
    const body = String(data.get('body') ?? '').trim();
    const quorumTypeResult = ProposalQuorumTypeSchema.safeParse(
      String(data.get('quorumType') ?? ''),
    );
    const closesAtLocal = String(data.get('closesAtLocal') ?? '').trim();
    const closesAt = String(data.get('closesAt') ?? '').trim();

    if (!title || !body) {
      return fail(400, { error: 'Title and body are required.' });
    }
    if (!quorumTypeResult.success) {
      return fail(400, { error: 'Select a valid quorum mode.' });
    }
    if (closesAtLocal && !closesAt) {
      return fail(400, { error: 'Voting deadline must include a timezone.' });
    }

    const quorumType = quorumTypeResult.data;
    const thresholdPercentInput = String(
      data.get('quorumThresholdPercent') ?? '',
    ).trim();
    let quorumThreshold: number | undefined;
    if (quorumType === 'custom') {
      if (!thresholdPercentInput) {
        return fail(400, {
          error: 'Custom quorum threshold is required.',
        });
      }
      const thresholdPercent = Number(thresholdPercentInput);
      quorumThreshold = thresholdPercent / 100;
      if (
        !Number.isFinite(quorumThreshold) ||
        quorumThreshold < 0 ||
        quorumThreshold > 1
      ) {
        return fail(400, {
          error: 'Custom quorum threshold must be between 0 and 100%.',
        });
      }
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    let proposal;
    try {
      proposal = await api.createProposal({
        title,
        body,
        votingType: 'binary',
        quorumType,
        ...(quorumThreshold === undefined ? {} : { quorumThreshold }),
        closesAt: closesAt || undefined,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { error: err.message });
      }
      return fail(500, { error: 'Failed to create proposal.' });
    }

    redirect(302, `/coop/${params.handle}/governance/${proposal.id}`);
  },
};
