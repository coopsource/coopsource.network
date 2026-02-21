import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoopSourceClient } from '../src/client.js';
import {
  BASE_URL,
  COOKIE,
  COOP_URI,
  ENCODED_COOP_URI,
  mockOkResponse,
  createMockFetchAndClient,
} from './helpers.js';

describe('CoopSourceClient - Cooperatives', () => {
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

  // --- listCooperatives ---

  describe('listCooperatives', () => {
    it('sends GET /api/cooperatives without params', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ cooperatives: [], cursor: null }),
      );

      const result = await client.listCooperatives();

      expect(result).toEqual({ data: [], cursor: null });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/cooperatives`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
      expect(init.body).toBeUndefined();
    });

    it('sends query params when provided', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ cooperatives: [], cursor: 'next123' }),
      );

      const result = await client.listCooperatives({ limit: 10, cursor: 'abc' });

      expect(result).toEqual({ data: [], cursor: 'next123' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('limit')).toBe('10');
      expect(parsedUrl.searchParams.get('cursor')).toBe('abc');
    });
  });

  // --- createCooperative ---

  describe('createCooperative', () => {
    it('sends POST /api/cooperatives with JSON body', async () => {
      const input = { name: 'Test Coop', description: 'A test cooperative' };
      const created = {
        uri: COOP_URI,
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

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/cooperatives`);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Cookie: COOKIE,
        }),
      );
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  // --- getCooperative ---

  describe('getCooperative', () => {
    it('sends GET /api/cooperatives/{encoded} with the encoded URI', async () => {
      const cooperative = {
        uri: COOP_URI,
        did: 'did:plc:abc',
        name: 'Test Coop',
        description: 'A test cooperative',
        logoUrl: null,
        website: null,
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(cooperative));

      const result = await client.getCooperative(COOP_URI);

      expect(result).toEqual(cooperative);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/cooperatives/${ENCODED_COOP_URI}`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
      expect(init.body).toBeUndefined();
    });
  });

  // --- updateCooperative ---

  describe('updateCooperative', () => {
    it('sends PUT /api/cooperatives/{encoded} with JSON body', async () => {
      const input = { name: 'Updated Coop' };
      const updated = {
        uri: COOP_URI,
        did: 'did:plc:abc',
        name: 'Updated Coop',
        description: 'A test cooperative',
        logoUrl: null,
        website: null,
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(updated));

      const result = await client.updateCooperative(COOP_URI, input);

      expect(result).toEqual(updated);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/cooperatives/${ENCODED_COOP_URI}`);
      expect(init.method).toBe('PUT');
      expect(init.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Cookie: COOKIE,
        }),
      );
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });
});
