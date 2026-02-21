import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoopSourceClient } from '../src/client.js';
import { ApiError } from '../src/errors.js';
import {
  BASE_URL,
  PROJECT_URI,
  ENCODED_PROJECT_URI,
  INTEREST_URI,
  ENCODED_INTEREST_URI,
  mockOkResponse,
  mockErrorResponse,
  createMockFetchAndClient,
} from './helpers.js';

describe('CoopSourceClient - Alignment', () => {
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

  // =====================================================================
  // listInterests
  // =====================================================================

  describe('listInterests', () => {
    it('sends GET /api/projects/{encoded}/interests and maps response', async () => {
      // API returns { interests: [...], cursor } but client maps to { data: [...], cursor }
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ interests: [], cursor: null }),
      );

      const result = await client.listInterests(PROJECT_URI);

      expect(result).toEqual({ data: [], cursor: null });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/interests`,
      );
      expect(init.method).toBe('GET');
    });

    it('returns interest data mapped to the data field', async () => {
      const interest = {
        uri: INTEREST_URI,
        did: 'did:plc:abc',
        projectUri: PROJECT_URI,
        interests: [
          { category: 'technical', description: 'Build APIs', priority: 1 },
        ],
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ interests: [interest], cursor: 'next-cursor' }),
      );

      const result = await client.listInterests(PROJECT_URI);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(interest);
      expect(result.cursor).toBe('next-cursor');
    });

    it('includes pagination query params', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ interests: [], cursor: null }),
      );

      await client.listInterests(PROJECT_URI, { limit: 5, cursor: 'cur1' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('limit')).toBe('5');
      expect(parsedUrl.searchParams.get('cursor')).toBe('cur1');
    });

    it('omits query string when no pagination params given', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ interests: [], cursor: null }),
      );

      await client.listInterests(PROJECT_URI);

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).not.toContain('?');
    });
  });

  // =====================================================================
  // submitInterests
  // =====================================================================

  describe('submitInterests', () => {
    it('sends POST /api/projects/{encoded}/interests with body', async () => {
      const input = {
        interests: [
          { category: 'technical', description: 'Build APIs', priority: 1 },
        ],
      };
      const created = {
        uri: INTEREST_URI,
        did: 'did:plc:abc',
        projectUri: PROJECT_URI,
        interests: input.interests,
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.submitInterests(PROJECT_URI, input);

      expect(result).toEqual(created);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/interests`,
      );
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });

    it('sends Content-Type application/json header', async () => {
      const input = {
        interests: [
          { category: 'technical', description: 'Build APIs', priority: 1 },
        ],
      };
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({
          uri: INTEREST_URI,
          did: 'did:plc:abc',
          projectUri: PROJECT_URI,
          interests: input.interests,
          createdAt: '2026-01-01T00:00:00Z',
        }),
      );

      await client.submitInterests(PROJECT_URI, input);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  // =====================================================================
  // updateInterests
  // =====================================================================

  describe('updateInterests', () => {
    it('sends PUT /api/projects/{encodedProject}/interests/{encodedInterest} with body', async () => {
      const input = {
        interests: [
          { category: 'technical', description: 'Updated APIs', priority: 2 },
        ],
      };
      const updated = {
        uri: INTEREST_URI,
        did: 'did:plc:abc',
        projectUri: PROJECT_URI,
        interests: input.interests,
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(updated));

      const result = await client.updateInterests(
        PROJECT_URI,
        INTEREST_URI,
        input,
      );

      expect(result).toEqual(updated);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/interests/${ENCODED_INTEREST_URI}`,
      );
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });

    it('encodes both project and interest URIs in the path', async () => {
      const input = {
        interests: [
          { category: 'technical', description: 'Updated APIs', priority: 2 },
        ],
      };
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({
          uri: INTEREST_URI,
          did: 'did:plc:abc',
          projectUri: PROJECT_URI,
          interests: input.interests,
          createdAt: '2026-01-01T00:00:00Z',
        }),
      );

      await client.updateInterests(PROJECT_URI, INTEREST_URI, input);

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      // Both URIs should be encoded in the URL path
      expect(url).toContain(ENCODED_PROJECT_URI);
      expect(url).toContain(ENCODED_INTEREST_URI);
    });
  });

  // =====================================================================
  // getMyInterests
  // =====================================================================

  describe('getMyInterests', () => {
    it('sends GET /api/projects/{encoded}/interests/mine and returns Interest when found', async () => {
      const interest = {
        uri: INTEREST_URI,
        did: 'did:plc:abc',
        projectUri: PROJECT_URI,
        interests: [
          { category: 'technical', description: 'Build APIs', priority: 1 },
        ],
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(interest));

      const result = await client.getMyInterests(PROJECT_URI);

      expect(result).toEqual(interest);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/interests/mine`,
      );
      expect(init.method).toBe('GET');
    });

    it('returns null when server responds with 404', async () => {
      mockFetch.mockResolvedValueOnce(
        mockErrorResponse(404, {
          error: 'NotFound',
          message: 'No interests found',
        }),
      );

      const result = await client.getMyInterests(PROJECT_URI);

      expect(result).toBeNull();
    });

    it('rethrows non-404 errors', async () => {
      mockFetch.mockResolvedValueOnce(
        mockErrorResponse(500, {
          error: 'InternalError',
          message: 'Server error',
        }),
      );

      await expect(client.getMyInterests(PROJECT_URI)).rejects.toThrow(
        ApiError,
      );
    });

    it('rethrows 403 errors instead of returning null', async () => {
      mockFetch.mockResolvedValueOnce(
        mockErrorResponse(403, {
          error: 'Forbidden',
          message: 'Access denied',
        }),
      );

      try {
        await client.getMyInterests(PROJECT_URI);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(403);
        expect(apiErr.code).toBe('Forbidden');
      }
    });
  });

  // =====================================================================
  // getInterestMap
  // =====================================================================

  describe('getInterestMap', () => {
    it('sends GET /api/projects/{encoded}/interest-map and returns InterestMap', async () => {
      const map = {
        uri: 'at://did:plc:abc/network.coopsource.alignment.interestMap/map1',
        projectUri: PROJECT_URI,
        alignmentZones: [
          {
            theme: 'API design',
            stakeholders: ['did:plc:a', 'did:plc:b'],
            strength: 0.9,
            description: 'Shared interest in API development',
          },
        ],
        conflictZones: [],
        generatedAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(map));

      const result = await client.getInterestMap(PROJECT_URI);

      expect(result).toEqual(map);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/interest-map`,
      );
      expect(init.method).toBe('GET');
    });

    it('returns null when the server responds with null', async () => {
      mockFetch.mockResolvedValueOnce(mockOkResponse(null));

      const result = await client.getInterestMap(PROJECT_URI);

      expect(result).toBeNull();
    });
  });

  // =====================================================================
  // generateInterestMap
  // =====================================================================

  describe('generateInterestMap', () => {
    it('sends POST /api/projects/{encoded}/interest-map/generate and returns InterestMap', async () => {
      const map = {
        uri: 'at://did:plc:abc/network.coopsource.alignment.interestMap/map2',
        projectUri: PROJECT_URI,
        alignmentZones: [
          {
            theme: 'API design',
            stakeholders: ['did:plc:a', 'did:plc:b'],
            strength: 0.9,
            description: 'Shared interest',
          },
        ],
        conflictZones: [
          {
            theme: 'Timeline',
            parties: ['did:plc:a', 'did:plc:c'],
            severity: 0.6,
            description: 'Disagreement on delivery timeline',
          },
        ],
        generatedAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(map));

      const result = await client.generateInterestMap(PROJECT_URI);

      expect(result).toEqual(map);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/interest-map/generate`,
      );
      expect(init.method).toBe('POST');
    });

    it('does not send a request body', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({
          uri: 'at://did:plc:abc/network.coopsource.alignment.interestMap/map2',
          projectUri: PROJECT_URI,
          alignmentZones: [],
          conflictZones: [],
          generatedAt: '2026-01-01T00:00:00Z',
        }),
      );

      await client.generateInterestMap(PROJECT_URI);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.body).toBeUndefined();
    });
  });

  // =====================================================================
  // createOutcome
  // =====================================================================

  describe('createOutcome', () => {
    it('sends POST /api/projects/{encoded}/outcomes with body', async () => {
      const input = {
        title: 'Launch MVP',
        description: 'Ship first version',
      };
      const created = {
        uri: 'at://did:plc:abc/network.coopsource.alignment.outcome/out1',
        did: 'did:plc:abc',
        projectUri: PROJECT_URI,
        title: 'Launch MVP',
        description: 'Ship first version',
        metrics: null,
        targetDate: null,
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.createOutcome(PROJECT_URI, input);

      expect(result).toEqual(created);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/outcomes`,
      );
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });

    it('sends Content-Type application/json header', async () => {
      const input = {
        title: 'Launch MVP',
        description: 'Ship first version',
      };
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({
          uri: 'at://did:plc:abc/network.coopsource.alignment.outcome/out1',
          did: 'did:plc:abc',
          projectUri: PROJECT_URI,
          title: 'Launch MVP',
          description: 'Ship first version',
          metrics: null,
          targetDate: null,
          status: 'active',
          createdAt: '2026-01-01T00:00:00Z',
        }),
      );

      await client.createOutcome(PROJECT_URI, input);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  // =====================================================================
  // listOutcomes
  // =====================================================================

  describe('listOutcomes', () => {
    it('sends GET /api/projects/{encoded}/outcomes and maps response', async () => {
      // API returns { outcomes: [...], cursor } but client maps to { data: [...], cursor }
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ outcomes: [], cursor: null }),
      );

      const result = await client.listOutcomes(PROJECT_URI);

      expect(result).toEqual({ data: [], cursor: null });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/outcomes`,
      );
      expect(init.method).toBe('GET');
    });

    it('returns outcome data mapped to the data field', async () => {
      const outcome = {
        uri: 'at://did:plc:abc/network.coopsource.alignment.outcome/out1',
        did: 'did:plc:abc',
        projectUri: PROJECT_URI,
        title: 'Launch MVP',
        description: 'Ship first version',
        metrics: null,
        targetDate: null,
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ outcomes: [outcome], cursor: 'next-out' }),
      );

      const result = await client.listOutcomes(PROJECT_URI);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(outcome);
      expect(result.cursor).toBe('next-out');
    });

    it('includes pagination query params', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ outcomes: [], cursor: null }),
      );

      await client.listOutcomes(PROJECT_URI, { limit: 10, cursor: 'abc' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('limit')).toBe('10');
      expect(parsedUrl.searchParams.get('cursor')).toBe('abc');
    });

    it('omits query string when no pagination params given', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ outcomes: [], cursor: null }),
      );

      await client.listOutcomes(PROJECT_URI);

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).not.toContain('?');
    });
  });
});
