import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoopSourceClient } from '../src/client.js';
import {
  BASE_URL,
  COOKIE,
  CONNECTION_URI,
  ENCODED_CONNECTION_URI,
  mockOkResponse,
  createMockFetchAndClient,
} from './helpers.js';

describe('CoopSourceClient - Connections', () => {
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

  // --- listConnections ---

  describe('listConnections', () => {
    it('sends GET /api/connections and returns connections array', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ connections: [] }),
      );

      const result = await client.listConnections();

      expect(result).toEqual({ connections: [] });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/connections`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });

    it('returns connections when present', async () => {
      const connections = [
        {
          uri: CONNECTION_URI,
          did: 'did:plc:abc',
          service: 'github',
          displayName: 'GitHub',
          status: 'active',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ connections }),
      );

      const result = await client.listConnections();

      expect(result.connections).toEqual(connections);
      expect(result.connections).toHaveLength(1);
    });
  });

  // --- getConnectionAuthorizeUrl ---

  describe('getConnectionAuthorizeUrl', () => {
    it('sends GET /api/connections/github/authorize and returns url', async () => {
      const authorizeUrl = 'https://github.com/login/oauth/authorize?client_id=abc&state=xyz';
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ url: authorizeUrl }),
      );

      const result = await client.getConnectionAuthorizeUrl('github');

      expect(result).toEqual({ url: authorizeUrl });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/connections/github/authorize`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });

    it('works with different service names', async () => {
      const authorizeUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc';
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ url: authorizeUrl }),
      );

      const result = await client.getConnectionAuthorizeUrl('google');

      expect(result).toEqual({ url: authorizeUrl });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/connections/google/authorize`);
    });
  });

  // --- disconnectService ---

  describe('disconnectService', () => {
    it('sends DELETE /api/connections/{encoded} and returns { ok: true }', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ ok: true }),
      );

      const result = await client.disconnectService(CONNECTION_URI);

      expect(result).toEqual({ ok: true });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/connections/${ENCODED_CONNECTION_URI}`);
      expect(init.method).toBe('DELETE');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });
  });

  // --- bindResource ---

  describe('bindResource', () => {
    it('sends POST /api/connections/{encoded}/bind with JSON body and returns binding', async () => {
      const input = {
        projectUri: 'at://did:plc:abc/network.coopsource.org.project/proj1',
        resourceId: 'repo-123',
        externalResourceUri: 'https://github.com/org/repo',
        metadata: { type: 'repository' },
      };
      const binding = {
        uri: 'at://did:plc:abc/network.coopsource.connection.binding/b1',
        connectionUri: CONNECTION_URI,
        projectUri: input.projectUri,
        resourceType: 'github_repo',
        resourceId: input.resourceId,
        resourceName: 'org/repo',
        resourceUrl: input.externalResourceUri,
        metadata: input.metadata,
        createdAt: '2026-01-15T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(binding));

      const result = await client.bindResource(CONNECTION_URI, input);

      expect(result).toEqual(binding);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/connections/${ENCODED_CONNECTION_URI}/bind`);
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
});
