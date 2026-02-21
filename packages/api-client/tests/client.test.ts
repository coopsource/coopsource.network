import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoopSourceClient } from '../src/client.js';
import { ApiError } from '../src/errors.js';

// --- Helpers ---

const BASE_URL = 'http://localhost:3001';
const COOKIE = 'connect.sid=abc';

const PROJECT_URI = 'at://did:plc:abc/network.coopsource.org.project/123';
const PROPOSAL_URI = 'at://did:plc:abc/network.coopsource.governance.proposal/456';

const ENCODED_PROJECT_URI = encodeURIComponent(PROJECT_URI);
const ENCODED_PROPOSAL_URI = encodeURIComponent(PROPOSAL_URI);

function mockOkResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    headers: new Headers(),
  } as unknown as Response;
}

function mockErrorResponse(
  status: number,
  body: { error?: string; message?: string },
): Response {
  return {
    ok: false,
    status,
    json: async () => body,
    headers: new Headers(),
  } as unknown as Response;
}

// --- Tests ---

const mockFetch = vi.fn<(...args: unknown[]) => Promise<Response>>();

describe('CoopSourceClient', () => {
  let client: CoopSourceClient;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    client = new CoopSourceClient(BASE_URL, { cookie: COOKIE });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // --- Auth ---

  describe('getMe', () => {
    it('sends GET /auth/me with cookie header', async () => {
      const user = { did: 'did:plc:abc', handle: 'alice.test', displayName: 'Alice' };
      mockFetch.mockResolvedValueOnce(mockOkResponse(user));

      const result = await client.getMe();

      expect(result).toEqual(user);
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/auth/me`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
      expect(init.body).toBeUndefined();
    });
  });

  // --- Cooperatives ---

  describe('listCooperatives', () => {
    it('sends GET /api/cooperatives without params', async () => {
      const payload = { data: [], cursor: null };
      mockFetch.mockResolvedValueOnce(mockOkResponse(payload));

      const result = await client.listCooperatives();

      expect(result).toEqual(payload);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/cooperatives`);
      expect(init.method).toBe('GET');
    });

    it('sends query params when provided', async () => {
      const payload = { data: [], cursor: 'next123' };
      mockFetch.mockResolvedValueOnce(mockOkResponse(payload));

      await client.listCooperatives({ limit: 10, cursor: 'abc' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('limit')).toBe('10');
      expect(parsedUrl.searchParams.get('cursor')).toBe('abc');
    });
  });

  describe('createCooperative', () => {
    it('sends POST /api/cooperatives with JSON body', async () => {
      const input = { name: 'Test Coop', description: 'A test cooperative' };
      const created = {
        uri: 'at://did:plc:abc/network.coopsource.org.cooperative/xyz',
        did: 'did:plc:abc',
        name: 'Test Coop',
        description: 'A test cooperative',
        logoUrl: null,
        website: null,
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.createCooperative(input);

      expect(result).toEqual(created);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/cooperatives`);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual(
        expect.objectContaining({ 'Content-Type': 'application/json', Cookie: COOKIE }),
      );
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  // --- Projects ---

  describe('listProjects', () => {
    it('sends GET /api/projects without params', async () => {
      const payload = { data: [], cursor: null };
      mockFetch.mockResolvedValueOnce(mockOkResponse(payload));

      const result = await client.listProjects();

      expect(result).toEqual(payload);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects`);
      expect(init.method).toBe('GET');
    });

    it('sends cooperativeUri query param', async () => {
      const coopUri = 'at://did:plc:abc/network.coopsource.org.cooperative/xyz';
      const payload = { data: [], cursor: null };
      mockFetch.mockResolvedValueOnce(mockOkResponse(payload));

      await client.listProjects({ cooperativeUri: coopUri });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('cooperativeUri')).toBe(coopUri);
    });
  });

  describe('createProject', () => {
    it('sends POST /api/projects with JSON body', async () => {
      const input = { name: 'Test Project', cooperativeUri: 'at://did:plc:abc/coop/xyz' };
      const created = {
        uri: PROJECT_URI,
        did: 'did:plc:abc',
        name: 'Test Project',
        description: null,
        cooperativeUri: 'at://did:plc:abc/coop/xyz',
        visibility: 'members',
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.createProject(input);

      expect(result).toEqual(created);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  // --- Alignment ---

  describe('listInterests', () => {
    it('sends GET /api/projects/{encoded}/interests', async () => {
      const payload = { data: [], cursor: null };
      mockFetch.mockResolvedValueOnce(mockOkResponse(payload));

      const result = await client.listInterests(PROJECT_URI);

      expect(result).toEqual(payload);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/interests`);
      expect(init.method).toBe('GET');
    });

    it('includes pagination query params', async () => {
      const payload = { data: [], cursor: null };
      mockFetch.mockResolvedValueOnce(mockOkResponse(payload));

      await client.listInterests(PROJECT_URI, { limit: 5, cursor: 'cur1' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('limit')).toBe('5');
      expect(parsedUrl.searchParams.get('cursor')).toBe('cur1');
    });
  });

  describe('submitInterests', () => {
    it('sends POST /api/projects/{encoded}/interests with body', async () => {
      const input = {
        interests: [{ category: 'technical', description: 'Build APIs', priority: 1 }],
      };
      const created = {
        uri: 'at://did:plc:abc/network.coopsource.alignment.interest/int1',
        did: 'did:plc:abc',
        projectUri: PROJECT_URI,
        interests: input.interests,
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.submitInterests(PROJECT_URI, input);

      expect(result).toEqual(created);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/interests`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  describe('getMyInterests', () => {
    it('sends GET /api/projects/{encoded}/interests/mine', async () => {
      const interest = {
        uri: 'at://did:plc:abc/network.coopsource.alignment.interest/int1',
        did: 'did:plc:abc',
        projectUri: PROJECT_URI,
        interests: [{ category: 'technical', description: 'Build APIs', priority: 1 }],
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(interest));

      const result = await client.getMyInterests(PROJECT_URI);

      expect(result).toEqual(interest);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/interests/mine`);
      expect(init.method).toBe('GET');
    });

    it('returns null when server responds with 404', async () => {
      mockFetch.mockResolvedValueOnce(
        mockErrorResponse(404, { error: 'NotFound', message: 'No interests found' }),
      );

      const result = await client.getMyInterests(PROJECT_URI);

      expect(result).toBeNull();
    });

    it('rethrows non-404 errors', async () => {
      mockFetch.mockResolvedValueOnce(
        mockErrorResponse(500, { error: 'InternalError', message: 'Server error' }),
      );

      await expect(client.getMyInterests(PROJECT_URI)).rejects.toThrow(ApiError);
    });
  });

  describe('getInterestMap', () => {
    it('sends GET /api/projects/{encoded}/interest-map', async () => {
      const map = {
        uri: 'at://did:plc:abc/network.coopsource.alignment.interestMap/map1',
        projectUri: PROJECT_URI,
        alignmentZones: [],
        conflictZones: [],
        generatedAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(map));

      const result = await client.getInterestMap(PROJECT_URI);

      expect(result).toEqual(map);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/interest-map`);
      expect(init.method).toBe('GET');
    });
  });

  describe('generateInterestMap', () => {
    it('sends POST /api/projects/{encoded}/interest-map/generate', async () => {
      const map = {
        uri: 'at://did:plc:abc/network.coopsource.alignment.interestMap/map2',
        projectUri: PROJECT_URI,
        alignmentZones: [
          { theme: 'API design', stakeholders: ['did:plc:a', 'did:plc:b'], strength: 0.9, description: 'Shared interest' },
        ],
        conflictZones: [],
        generatedAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(map));

      const result = await client.generateInterestMap(PROJECT_URI);

      expect(result).toEqual(map);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/interest-map/generate`);
      expect(init.method).toBe('POST');
    });
  });

  // --- Governance ---

  describe('listProposals', () => {
    it('sends GET /api/projects/{encoded}/proposals', async () => {
      const payload = { data: [], cursor: null };
      mockFetch.mockResolvedValueOnce(mockOkResponse(payload));

      const result = await client.listProposals(PROJECT_URI);

      expect(result).toEqual(payload);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/proposals`);
      expect(init.method).toBe('GET');
    });

    it('sends status query param', async () => {
      const payload = { data: [], cursor: null };
      mockFetch.mockResolvedValueOnce(mockOkResponse(payload));

      await client.listProposals(PROJECT_URI, { status: 'open' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('status')).toBe('open');
    });

    it('sends limit and cursor query params', async () => {
      const payload = { data: [], cursor: null };
      mockFetch.mockResolvedValueOnce(mockOkResponse(payload));

      await client.listProposals(PROJECT_URI, { limit: 20, cursor: 'xyz' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('limit')).toBe('20');
      expect(parsedUrl.searchParams.get('cursor')).toBe('xyz');
    });
  });

  describe('createProposal', () => {
    it('sends POST /api/projects/{encoded}/proposals with body', async () => {
      const input = {
        title: 'Adopt TypeScript Strict Mode',
        body: 'We should enable strict mode in all packages.',
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

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/proposals`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  describe('castVote', () => {
    it('sends POST /api/proposals/{encoded}/votes with body', async () => {
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

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/proposals/${ENCODED_PROPOSAL_URI}/votes`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  describe('getVoteResults', () => {
    it('sends GET /api/proposals/{encoded}/results', async () => {
      const results = {
        proposalUri: PROPOSAL_URI,
        totalVotes: 5,
        results: { approve: 4, reject: 1 },
        quorumMet: true,
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(results));

      const result = await client.getVoteResults(PROPOSAL_URI);

      expect(result).toEqual(results);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/proposals/${ENCODED_PROPOSAL_URI}/results`);
      expect(init.method).toBe('GET');
    });
  });

  // --- CLI Auth ---

  describe('cliInitLogin', () => {
    it('sends POST /auth/cli/sessions with handle', async () => {
      const response = { sessionId: 'sess-123' };
      mockFetch.mockResolvedValueOnce(mockOkResponse(response));

      const result = await client.cliInitLogin('alice.test');

      expect(result).toEqual(response);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/auth/cli/sessions`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ handle: 'alice.test' });
    });
  });

  describe('cliPollLogin', () => {
    it('sends GET /auth/cli/sessions/{id}/status', async () => {
      const response = { status: 'pending' as const };
      mockFetch.mockResolvedValueOnce(mockOkResponse(response));

      const result = await client.cliPollLogin('sess-123');

      expect(result).toEqual(response);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/auth/cli/sessions/sess-123/status`);
      expect(init.method).toBe('GET');
    });

    it('returns complete status with exchange code', async () => {
      const response = { status: 'complete' as const, exchangeCode: 'code-xyz' };
      mockFetch.mockResolvedValueOnce(mockOkResponse(response));

      const result = await client.cliPollLogin('sess-456');

      expect(result).toEqual(response);
      expect(result.status).toBe('complete');
      expect(result.exchangeCode).toBe('code-xyz');
    });
  });

  // --- Error handling ---

  describe('error handling', () => {
    it('throws ApiError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(
        mockErrorResponse(403, { error: 'Forbidden', message: 'Access denied' }),
      );

      await expect(client.getMe()).rejects.toThrow(ApiError);

      try {
        mockFetch.mockResolvedValueOnce(
          mockErrorResponse(403, { error: 'Forbidden', message: 'Access denied' }),
        );
        await client.getMe();
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(403);
        expect(apiErr.code).toBe('Forbidden');
        expect(apiErr.message).toBe('Access denied');
      }
    });

    it('uses defaults when error body lacks fields', async () => {
      mockFetch.mockResolvedValueOnce(
        mockErrorResponse(500, {}),
      );

      try {
        await client.getMe();
      } catch (err) {
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(500);
        expect(apiErr.code).toBe('UnknownError');
        expect(apiErr.message).toBe('HTTP 500');
      }
    });

    it('handles non-JSON error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => { throw new SyntaxError('Unexpected token'); },
        headers: new Headers(),
      } as unknown as Response);

      try {
        await client.getMe();
      } catch (err) {
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(502);
        expect(apiErr.code).toBe('UnknownError');
        expect(apiErr.message).toBe('HTTP 502');
      }
    });
  });

  // --- Edge cases ---

  describe('trailing slash removal', () => {
    it('strips trailing slashes from base URL', async () => {
      const clientWithSlash = new CoopSourceClient('http://localhost:3001/', { cookie: COOKIE });
      const user = { did: 'did:plc:abc', handle: 'alice.test', displayName: 'Alice' };
      mockFetch.mockResolvedValueOnce(mockOkResponse(user));

      await clientWithSlash.getMe();

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:3001/auth/me');
    });
  });

  describe('no cookie', () => {
    it('omits Cookie header when no cookie is provided', async () => {
      const noCookieClient = new CoopSourceClient(BASE_URL);
      const payload = { data: [], cursor: null };
      mockFetch.mockResolvedValueOnce(mockOkResponse(payload));

      await noCookieClient.listCooperatives();

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Cookie']).toBeUndefined();
    });
  });
});
