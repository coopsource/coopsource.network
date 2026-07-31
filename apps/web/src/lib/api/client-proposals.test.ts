import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';

const proposal = {
  id: 'proposal-1',
  title: 'Adopt open source policy',
  body: 'Release internal tools under an open source license.',
  status: 'draft',
  outcome: null,
  votingType: 'approval',
  quorumType: 'superMajority',
  quorumBasis: 'votesCast',
  quorumThreshold: null,
  closesAt: '2030-06-15T19:30:00.000Z',
  authorDid: 'did:plc:proposal-author',
  authorDisplayName: 'Proposal Author',
  authorHandle: 'proposal-author',
  createdAt: '2026-07-30T12:00:00.000Z',
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('proposal API client contracts', () => {
  it('validates canonical proposal item and collection responses', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(proposal))
      .mockResolvedValueOnce(
        jsonResponse({ proposals: [proposal], cursor: 'next-page' }),
      );
    const api = createApiClient(fetchFn, undefined, 'https://api.example');

    await expect(api.getProposal(proposal.id)).resolves.toEqual(proposal);
    await expect(
      api.getProposals({ status: 'draft', limit: 20 }),
    ).resolves.toEqual({
      proposals: [proposal],
      cursor: 'next-page',
    });

    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example/api/v1/proposals/proposal-1',
      'https://api.example/api/v1/proposals?status=draft&limit=20',
    ]);
  });

  it('rejects legacy proposal metadata at the client boundary', async () => {
    const { votingType: _votingType, ...withoutVotingType } = proposal;
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ...withoutVotingType,
        proposalType: 'policy',
        votingMethod: 'approval',
      }),
    );
    const api = createApiClient(fetchFn, undefined, 'https://api.example');

    await expect(api.getProposal(proposal.id)).rejects.toMatchObject({
      name: 'ZodError',
    });
  });

  it('uses the update fields accepted by the proposal API', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(proposal));
    const api = createApiClient(fetchFn, undefined, 'https://api.example');

    await api.updateProposal(proposal.id, {
      title: 'Revised title',
      closesAt: '2030-07-01T19:30:00.000Z',
    });

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example/api/v1/proposals/proposal-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          title: 'Revised title',
          closesAt: '2030-07-01T19:30:00.000Z',
        }),
      }),
    );
  });

  it('submits only executable proposal voting modes', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(proposal));
    const api = createApiClient(fetchFn, undefined, 'https://api.example');

    await api.createProposal({
      title: proposal.title,
      body: proposal.body,
      votingType: 'binary',
      quorumType: 'custom',
      quorumThreshold: 0.75,
      closesAt: '2030-06-15T19:30:00.000Z',
    });

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example/api/v1/proposals',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: proposal.title,
          body: proposal.body,
          votingType: 'binary',
          quorumType: 'custom',
          quorumThreshold: 0.75,
          closesAt: '2030-06-15T19:30:00.000Z',
        }),
      }),
    );
  });
});
