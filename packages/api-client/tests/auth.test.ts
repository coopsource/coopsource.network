import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoopSourceClient } from '../src/client.js';
import { ApiError } from '../src/errors.js';
import {
  BASE_URL,
  COOKIE,
  mockOkResponse,
  mockErrorResponse,
  mock204Response,
  createMockFetchAndClient,
} from './helpers.js';

describe('CoopSourceClient - Auth', () => {
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

  describe('getMe', () => {
    it('sends GET /auth/me with cookie header and returns user', async () => {
      const user = { did: 'did:plc:abc', handle: 'alice.test' };
      mockFetch.mockResolvedValueOnce(mockOkResponse(user));

      const result = await client.getMe();

      expect(result).toEqual(user);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/auth/me`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });
  });

  describe('logout', () => {
    it('sends POST /auth/logout and returns void', async () => {
      mockFetch.mockResolvedValueOnce(mock204Response());

      const result = await client.logout();

      expect(result).toBeUndefined();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/auth/logout`);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });
  });

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

    it('uses default error values when error body lacks fields', async () => {
      mockFetch.mockResolvedValueOnce(mockErrorResponse(500, {}));

      try {
        await client.getMe();
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
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
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
        headers: new Headers(),
      } as unknown as Response);

      try {
        await client.getMe();
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(502);
        expect(apiErr.code).toBe('UnknownError');
        expect(apiErr.message).toBe('HTTP 502');
      }
    });
  });

  describe('edge cases', () => {
    it('removes trailing slash from base URL', async () => {
      restoreFetch();
      const ctx = createMockFetchAndClient();
      mockFetch = ctx.mockFetch;
      restoreFetch = ctx.restore;

      const trailingSlashClient = new CoopSourceClient(`${BASE_URL}/`, {
        cookie: COOKIE,
      });
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ did: 'did:plc:abc', handle: 'alice.test' }),
      );

      await trailingSlashClient.getMe();

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/auth/me`);
    });

    it('omits Cookie header when no cookie provided', async () => {
      restoreFetch();
      const ctx = createMockFetchAndClient();
      mockFetch = ctx.mockFetch;
      restoreFetch = ctx.restore;

      const noCookieClient = new CoopSourceClient(BASE_URL);
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ did: 'did:plc:abc', handle: 'alice.test' }),
      );

      await noCookieClient.getMe();

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.headers).toEqual({});
    });
  });
});
