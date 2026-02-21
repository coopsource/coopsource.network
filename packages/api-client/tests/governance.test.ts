import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoopSourceClient } from '../src/client.js';
import { ApiError } from '../src/errors.js';
import {
  BASE_URL,
  PROJECT_URI,
  ENCODED_PROJECT_URI,
  PROPOSAL_URI,
  ENCODED_PROPOSAL_URI,
  DELEGATION_URI,
  ENCODED_DELEGATION_URI,
  mockOkResponse,
  mockErrorResponse,
  createMockFetchAndClient,
} from './helpers.js';

describe('CoopSourceClient - Governance', () => {
  let mockFetch: ReturnType<typeof createMockFetchAndClient>['mockFetch'];
  let client: CoopSourceClient;
  let restoreFetch: () => void;

  beforeEach(() => {
    const ctx = createMockFetchAndClient();
    mockFetch = ctx.mockFetch;
    client = ctx.client;
    restoreFetch = ctx.restore;
  });

  afterEach(() => {
    restoreFetch();
  });

  // --- listProposals ---

  describe('listProposals', () => {
    it('sends GET /api/projects/{encoded}/proposals and maps proposals to data', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ proposals: [], cursor: null }),
      );

      const result = await client.listProposals(PROJECT_URI);

      expect(result).toEqual({ data: [], cursor: null });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/proposals`);
      expect(init.method).toBe('GET');
    });

    it('sends status query param', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ proposals: [], cursor: null }),
      );

      await client.listProposals(PROJECT_URI, { status: 'open' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('status')).toBe('open');
    });

    it('sends limit and cursor query params', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ proposals: [], cursor: null }),
      );

      await client.listProposals(PROJECT_URI, { limit: 20, cursor: 'xyz' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('limit')).toBe('20');
      expect(parsedUrl.searchParams.get('cursor')).toBe('xyz');
    });
  });

  // --- createProposal ---

  describe('createProposal', () => {
    it('sends POST /api/projects/{encoded}/proposals with JSON body', async () => {
      const input = {
        title: 'Adopt TypeScript Strict Mode',
        body: 'Enable strict mode',
        proposalType: 'standard',
        votingMethod: 'simple_majority',
      };
      const created = {
        uri: PROPOSAL_URI,
        did: 'did:plc:abc',
        projectUri: PROJECT_URI,
        title: input.title,
        body: input.body,
        proposalType: input.proposalType,
        status: 'discussion',
        votingMethod: input.votingMethod,
        quorumRequired: null,
        discussionEndsAt: null,
        votingEndsAt: null,
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.createProposal(PROJECT_URI, input);

      expect(result).toEqual(created);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/proposals`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  // --- getProposal ---

  describe('getProposal', () => {
    it('sends GET /api/proposals/{encoded}', async () => {
      const proposal = {
        uri: PROPOSAL_URI,
        did: 'did:plc:abc',
        projectUri: PROJECT_URI,
        title: 'Adopt TypeScript Strict Mode',
        body: 'Enable strict mode',
        proposalType: 'standard',
        status: 'discussion',
        votingMethod: 'simple_majority',
        quorumRequired: null,
        discussionEndsAt: null,
        votingEndsAt: null,
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(proposal));

      const result = await client.getProposal(PROPOSAL_URI);

      expect(result).toEqual(proposal);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/proposals/${ENCODED_PROPOSAL_URI}`);
      expect(init.method).toBe('GET');
    });
  });

  // --- updateProposalStatus ---

  describe('updateProposalStatus', () => {
    it('sends PUT /api/proposals/{encoded}/status with JSON body', async () => {
      const input = { status: 'voting' };
      const updated = {
        uri: PROPOSAL_URI,
        did: 'did:plc:abc',
        projectUri: PROJECT_URI,
        title: 'Adopt TypeScript Strict Mode',
        body: 'Enable strict mode',
        proposalType: 'standard',
        status: 'voting',
        votingMethod: 'simple_majority',
        quorumRequired: null,
        discussionEndsAt: null,
        votingEndsAt: null,
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(updated));

      const result = await client.updateProposalStatus(PROPOSAL_URI, input);

      expect(result).toEqual(updated);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/proposals/${ENCODED_PROPOSAL_URI}/status`);
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  // --- castVote ---

  describe('castVote', () => {
    it('sends POST /api/proposals/{encoded}/votes with JSON body', async () => {
      const input = { choice: 'approve', weight: 1, rationale: 'Sounds good' };
      const created = {
        uri: 'at://did:plc:abc/network.coopsource.governance.vote/v1',
        did: 'did:plc:abc',
        proposalUri: PROPOSAL_URI,
        choice: 'approve',
        weight: 1,
        rationale: 'Sounds good',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.castVote(PROPOSAL_URI, input);

      expect(result).toEqual(created);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/proposals/${ENCODED_PROPOSAL_URI}/votes`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  // --- listVotes ---

  describe('listVotes', () => {
    it('sends GET /api/proposals/{encoded}/votes and returns VoteListResponse', async () => {
      const response = { votes: [], proposalUri: PROPOSAL_URI };
      mockFetch.mockResolvedValueOnce(mockOkResponse(response));

      const result = await client.listVotes(PROPOSAL_URI);

      expect(result).toEqual({ votes: [], proposalUri: PROPOSAL_URI });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/proposals/${ENCODED_PROPOSAL_URI}/votes`);
      expect(init.method).toBe('GET');
    });
  });

  // --- getMyVote ---

  describe('getMyVote', () => {
    it('sends GET /api/proposals/{encoded}/votes/me and returns a Vote', async () => {
      const vote = {
        uri: 'at://did:plc:abc/network.coopsource.governance.vote/v1',
        did: 'did:plc:abc',
        proposalUri: PROPOSAL_URI,
        choice: 'approve',
        weight: 1,
        rationale: 'Sounds good',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(vote));

      const result = await client.getMyVote(PROPOSAL_URI);

      expect(result).toEqual(vote);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/proposals/${ENCODED_PROPOSAL_URI}/votes/me`);
      expect(init.method).toBe('GET');
    });

    it('returns null when server responds with 404', async () => {
      mockFetch.mockResolvedValueOnce(
        mockErrorResponse(404, { error: 'NotFound', message: 'No vote found' }),
      );

      const result = await client.getMyVote(PROPOSAL_URI);

      expect(result).toBeNull();
    });

    it('rethrows non-404 errors', async () => {
      mockFetch.mockResolvedValueOnce(
        mockErrorResponse(500, { error: 'InternalError', message: 'Server error' }),
      );

      await expect(client.getMyVote(PROPOSAL_URI)).rejects.toThrow(ApiError);
    });
  });

  // --- getVoteResults ---

  describe('getVoteResults', () => {
    it('sends GET /api/proposals/{encoded}/results and returns VoteResults', async () => {
      const results = {
        proposalUri: PROPOSAL_URI,
        totalVotes: 5,
        results: { approve: 4, reject: 1 },
        quorumMet: true,
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(results));

      const result = await client.getVoteResults(PROPOSAL_URI);

      expect(result).toEqual(results);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/proposals/${ENCODED_PROPOSAL_URI}/results`);
      expect(init.method).toBe('GET');
    });
  });

  // --- createDelegation ---

  describe('createDelegation', () => {
    it('sends POST /api/projects/{encoded}/delegations with JSON body', async () => {
      const input = { delegateTo: 'did:plc:bob', scope: 'governance' };
      const created = {
        uri: DELEGATION_URI,
        did: 'did:plc:abc',
        projectUri: PROJECT_URI,
        delegateTo: 'did:plc:bob',
        scope: 'governance',
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.createDelegation(PROJECT_URI, input);

      expect(result).toEqual(created);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/delegations`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  // --- listDelegations ---

  describe('listDelegations', () => {
    it('sends GET /api/projects/{encoded}/delegations and returns DelegationListResponse', async () => {
      const response = { delegations: [] };
      mockFetch.mockResolvedValueOnce(mockOkResponse(response));

      const result = await client.listDelegations(PROJECT_URI);

      expect(result).toEqual({ delegations: [] });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/delegations`);
      expect(init.method).toBe('GET');
    });
  });

  // --- revokeDelegation ---

  describe('revokeDelegation', () => {
    it('sends DELETE /api/delegations/{encoded} and returns Delegation', async () => {
      const revoked = {
        uri: DELEGATION_URI,
        did: 'did:plc:abc',
        projectUri: PROJECT_URI,
        delegateTo: 'did:plc:bob',
        scope: 'governance',
        status: 'revoked',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(revoked));

      const result = await client.revokeDelegation(DELEGATION_URI);

      expect(result).toEqual(revoked);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/delegations/${ENCODED_DELEGATION_URI}`);
      expect(init.method).toBe('DELETE');
    });
  });
});
